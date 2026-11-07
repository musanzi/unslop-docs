from io import BytesIO
from zipfile import ZipFile
from server import count_pages


def document(pages):
    output = BytesIO()
    body = ''.join('<w:p><w:r>' + ('<w:br w:type="page"/>' if i else '') + f'<w:t>Page {i + 1}. This document checks the upload page limit.</w:t></w:r></w:p>' for i in range(pages))
    with ZipFile(output, 'w') as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        archive.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        archive.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>')
        archive.writestr('docProps/app.xml', '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Pages>1</Pages></Properties>')
    return output.getvalue()


if __name__ == '__main__':
    for pages in (1, 30, 31):
        actual = count_pages(document(pages))
        assert actual == pages, (pages, actual)
        print(f'Rendered {actual} pages despite saved metadata reporting 1.')
