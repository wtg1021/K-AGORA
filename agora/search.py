"""Explainable lexical ranking; no external model or document transfer."""
import math
import re
import unicodedata
from collections import Counter

GROUPS = (
    ('법인카드', '카드사용', '카드내역', '카드결제'),
    ('일괄', '한꺼번에', '한번에', '대량', '일괄등록', '일괄처리'),
    ('급여', '보수', '월급', '인건비'),
    ('지출', '지급', '집행'),
    ('권한', '접근', '인수인계', '담당자변경'),
    ('첨부', '파일', '증빙', '문서'),
    ('오류', '에러', '실패'),
    ('조회', '검색', '찾기', '찾아'),
    ('엑셀', 'excel', '스프레드시트'),
    ('계약', '계약서', '조달'),
)
STOP = {'안건', '전에', '있었어', '있나요', '해주세요', '하고', '싶어요', '기능', '어떻게', '관련', '대한', '있는', '하는', '에서', '으로', '그때', '결과'}
SUFFIXES = ('에서는', '으로는', '내역을', '내용을', '기능을', '하는', '에서', '으로', '하고', '이나', '이나요', '을', '를', '이', '가', '은', '는', '에', '도')

def normalize(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value).lower())

def terms(value):
    result = []
    for word in re.findall(r'[가-힣a-z0-9]+', unicodedata.normalize('NFKC', value).lower()):
        for suffix in SUFFIXES:
            if word.endswith(suffix) and len(word) > len(suffix) + 1:
                word = word[:-len(suffix)]
                break
        if word not in STOP and len(word) > 1:
            result.append(word)
    compact = normalize(value)
    for i, group in enumerate(GROUPS):
        if any(term in compact for term in group):
            result.append(f'concept{i}')
    return set(result)

def rank(agendas, query):
    query_terms = terms(query)
    if not query.strip():
        return [(a, None, []) for a in sorted(agendas, key=lambda a: a['date'], reverse=True)]
    if not query_terms:
        return []
    documents = []
    for a in agendas:
        title = terms(a['title'])
        body = terms(' '.join(str(a.get(f, '')) for f in ('title', 'keywords', 'situation', 'problem', 'request', 'effect', 'review', 'answer', 'field')))
        documents.append((a, title, body))
    frequency = Counter(t for _, _, body in documents for t in body)
    result = []
    for a, title, body in documents:
        matched = query_terms & body
        # Substring matches accommodate Korean compounds without a tokenizer model.
        compact = normalize(' '.join(str(a.get(f, '')) for f in ('title', 'request', 'keywords', 'answer')))
        matched |= {t for t in query_terms if not t.startswith('concept') and t in compact}
        if not matched:
            continue
        score = sum((2 if t in title else 1) * (1 + math.log(1 + len(agendas)/(1+frequency[t]))) for t in matched)
        score /= math.sqrt(max(1, len(body)))
        score *= len(matched) / len(query_terms)
        labels = [t for t in sorted(matched) if not t.startswith('concept')]
        labels += [GROUPS[int(t[7:])][0] + ' 동의어' for t in sorted(matched) if t.startswith('concept')]
        result.append((a, round(score, 3), labels))
    return sorted(result, key=lambda r: (r[1], r[0]['date']), reverse=True)
