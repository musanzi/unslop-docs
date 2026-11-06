import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 10_000_000
BUSY = threading.Lock()


def run_bounded(args, seconds):
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        output, _ = process.communicate(timeout=seconds)
        if process.returncode:
            raise ValueError('Rendering failed')
        return output
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def count_pages(data):
    with tempfile.TemporaryDirectory(prefix='docx-pages-') as directory:
        root = Path(directory)
        source = root / 'document.docx'
        source.write_bytes(data)
        profile = root / 'profile'
        user = profile / 'user'
        user.mkdir(parents=True)
        (user / 'registrymodifications.xcu').write_text('''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
</oor:items>''')
        run_bounded(['soffice', f'-env:UserInstallation={profile.as_uri()}', '--headless', '--nologo', '--norestore', '--convert-to', 'pdf:writer_pdf_Export:{"IsSkipEmptyPages":{"type":"boolean","value":"false"}}', '--outdir', str(root), str(source)], 45)
        output = run_bounded(['pdfinfo', str(root / 'document.pdf')], 10).decode('utf-8', errors='replace')
        match = re.search(r'^Pages:\s+(\d+)\s*$', output, re.MULTILINE)
        if not match or int(match.group(1)) < 1:
            raise ValueError('Page count unavailable')
        return int(match.group(1))


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, *args):
        pass

    def respond(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.respond(200 if self.path == '/health' else 404, {'ready': self.path == '/health'})

    def do_POST(self):
        if self.path != '/pages':
            self.respond(404, {'error': 'Not found'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        if not 0 < size <= MAX_BYTES:
            self.respond(413, {'error': 'Invalid document size'})
            return
        if not BUSY.acquire(blocking=False):
            self.respond(503, {'error': 'Renderer is busy. Retry the upload.'})
            return
        try:
            data = self.rfile.read(size)
            if len(data) != size:
                raise ValueError('Incomplete document')
            self.respond(200, {'pages': count_pages(data), 'sha256': hashlib.sha256(data).hexdigest()})
        except (ValueError, OSError, subprocess.TimeoutExpired):
            self.respond(422, {'error': 'Unable to render document'})
        finally:
            BUSY.release()


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8091), Handler).serve_forever()
