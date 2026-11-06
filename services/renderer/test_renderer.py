import unittest
from unittest.mock import patch
from server import count_pages


class PageCountTests(unittest.TestCase):
    @patch('server.run_bounded')
    def test_uses_rendered_pdf_page_count(self, run):
        run.side_effect = [b'', b'Title: Document\nPages: 6\n']
        self.assertEqual(count_pages(b'document'), 6)
        self.assertIn('--headless', run.call_args_list[0].args[0])
        self.assertEqual(run.call_args_list[1].args[0][0], 'pdfinfo')

    @patch('server.run_bounded')
    def test_missing_page_count_fails_closed(self, run):
        run.side_effect = [b'', b'Title: Document\n']
        with self.assertRaises(ValueError):
            count_pages(b'document')

    @patch('server.run_bounded')
    def test_empty_pdf_fails_closed(self, run):
        run.side_effect = [b'', b'Pages: 0\n']
        with self.assertRaises(ValueError):
            count_pages(b'document')


if __name__ == '__main__':
    unittest.main()
