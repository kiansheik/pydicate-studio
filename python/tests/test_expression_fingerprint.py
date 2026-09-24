import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_authoring import expression_fingerprint, expression_tree


class ExpressionFingerprintTests(unittest.TestCase):
    def test_spacing_parens_quotes_and_line_breaks_do_not_change_syntax(self):
        for left, right in [
            ('(abe * mbae).var(1) @ (oia + nhote)', '(\n (((abe) * (mbae))).var(1)\n @ ((oia) + (nhote))\n)'),
            ("Noun('a b', definition='meaning')", 'Noun("a b", definition="meaning",)'),
            ('a\n  * b\n * c', 'a * b * c'),
        ]:
            self.assertEqual(expression_fingerprint(left), expression_fingerprint(right))
            self.assertEqual(expression_tree(left)['expressionFingerprint'], expression_fingerprint(right))

    def test_grouping_operators_literals_arguments_and_comments_remain_significant(self):
        for left, right in [
            ('a * (b + c)', '(a * b) + c'),
            ('a * b', 'a + b'),
            ('a.var(1)', 'a.var(2)'),
            ("Noun('a b')", "Noun('ab')"),
            ('a # note one', 'a # note two'),
            ('a # note', 'a'),
            ('f(a,b)', 'f(b,a)'),
        ]:
            self.assertNotEqual(expression_fingerprint(left), expression_fingerprint(right))
