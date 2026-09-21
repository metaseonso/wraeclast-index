"""Whole-word, case-sensitive phrase matching, many phrases at once.

One matcher for both jobs the site has: every place a keyword's words appear (tools/kwuse.py) and every place a
card names another card (tools/nodelinks.py). Matching is exact — the phrase's own letters and case, with a word
boundary at each end — so "Shock" is never found inside "Shocked" and "fire" never inside "Fire".

find() gives every match, overlaps and all (a keyword can sit inside a longer name and still count as used).
scan() gives the matches a reader sees: the longest phrase at each place, never one inside another.
"""
import re
import sys
from collections import defaultdict


class Matcher:
    WORD = re.compile(r'\w+')

    def __init__(self, phrases, what='phrase', skip_bad=False):
        """phrases: phrase -> whatever it stands for. A phrase must start with a word character."""
        self.first = defaultdict(list)
        self.skipped = []
        for f, v in phrases.items():
            m = self.WORD.match(f)
            if not m:
                if not skip_bad:
                    sys.exit('a %s must start with a letter: %r' % (what, f))
                self.skipped.append(f)
                continue
            self.first[m.group(0)].append((f, v))
        for v in self.first.values():
            v.sort(key=lambda p: -len(p[0]))   # the longest phrase first, so scan() takes it

    def here(self, text, s, f):
        """Is phrase f at s, as a whole word? (its first word already matched, so only the end needs checking)"""
        e = s + len(f)
        return text.startswith(f, s) and (e == len(text) or not (text[e].isalnum() or text[e] == '_'))

    def find(self, text):
        """Every match: (start, end, phrase, value). They may overlap."""
        for m in self.WORD.finditer(text):
            for f, v in self.first.get(m.group(0), ()):
                if self.here(text, m.start(), f):
                    yield m.start(), m.start() + len(f), f, v

    def scan(self, text):
        """The matches left to right, longest first, never inside another: [(start, end, phrase, value)]."""
        out, pos = [], 0
        for m in self.WORD.finditer(text):
            if m.start() < pos:
                continue
            for f, v in self.first.get(m.group(0), ()):
                if self.here(text, m.start(), f):
                    out.append((m.start(), m.start() + len(f), f, v))
                    pos = m.start() + len(f)
                    break
        return out
