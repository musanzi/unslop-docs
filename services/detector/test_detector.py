import hashlib
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from core import MAX_SEGMENTS, result, score_tokens, segments
from server import create_server


class CoverageTests(unittest.TestCase):
    def test_long_document_includes_tail_once_and_balances_windows(self):
        ids = list(range(1021))
        windows = segments(ids)
        self.assertEqual([token for window in windows for token in window], ids)
        self.assertLessEqual(max(map(len, windows)), 510)
        self.assertLessEqual(max(map(len, windows)) - min(map(len, windows)), 1)

    def test_aggregation_weights_actual_tokens_instead_of_truncating(self):
        seen = []

        def predict(window):
            seen.extend(window)
            return 0.1 if window[0] == 0 else 0.9

        score, count = score_tokens(list(range(5)), predict, capacity=3)
        self.assertAlmostEqual(score, (0.1 * 2 + 0.9 * 3) / 5)
        self.assertEqual(count, 2)
        self.assertEqual(seen, list(range(5)))

    def test_invalid_outputs_and_excessive_coverage_fail_closed(self):
        for score in [float("nan"), float("inf"), -0.1, 1.1]:
            with self.assertRaises(ValueError):
                score_tokens([1, 2], lambda _: score)
        with self.assertRaises(ValueError):
            segments(list(range(MAX_SEGMENTS + 1)), capacity=1)

    def test_unicode_fingerprint_and_unavailable_result(self):
        text = "Les résultats 🌍"
        value = result(text, reason="too_short")
        self.assertEqual(value["textHash"], hashlib.sha256(text.encode()).hexdigest())
        self.assertEqual(value["characterCount"], len(text) + 1)
        self.assertIsNone(value["aiScore"])
        self.assertEqual(value["status"], "unavailable")


class HttpTests(unittest.TestCase):
    def test_service_does_not_return_input_and_sanitizes_errors(self):
        class FakeDetector:
            def detect(self, text):
                if text == "private-error":
                    raise RuntimeError(text)
                return result(text, score=0.25, token_count=50, segment_count=1)

        server = create_server(FakeDetector(), ("127.0.0.1", 0))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f"http://127.0.0.1:{server.server_port}/detect"
            request = Request(url, data=json.dumps({"text": "private-document"}).encode(), headers={"Content-Type": "application/json"})
            with urlopen(request) as response:
                body = response.read().decode()
                self.assertNotIn("private-document", body)
                self.assertEqual(json.loads(body)["aiScore"], 0.25)
            for data, status in [(b'{"text":"private-error"}', 503), (b'{"text":42}', 400), (b'[]', 400)]:
                with self.assertRaises(HTTPError) as raised:
                    urlopen(Request(url, data=data))
                self.assertEqual(raised.exception.code, status)
                self.assertNotIn("private-error", raised.exception.read().decode())
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
