"""Meeting form schema and lossless conversion of the uploaded master JSON."""
import json
import re

STATUSES = ('미확인', '검토 중', '일부 반영', '반영 완료', '미반영')
REVIEW_STATUSES = ('미검토', '현행유지', '협의필요', '개선예정')
BUSINESS_FIELDS = ('사업', '예산', '수입', '지출', '계약', '세무', '세입세출외현금', '예산결산', '발전기금', '기타')
SUBMISSION_TYPES = ('미분류', '협의체', '교육부', 'SR', '간담회', '기타')
FIELDS = ('number', 'meeting', 'date', 'region', 'organization', 'field', 'title', 'situation', 'problem', 'request', 'effect', 'review', 'answer', 'department', 'status', 'implemented_at', 'keywords', 'source', 'meeting_location', 'meeting_region', 'submission_type', 'source_agenda_number', 'target_menu', 'improvement_plan', 'additional_opinions', 'review_status', 'source_status', 'list_status', 'source_file', 'source_pages', 'review_notes', 'sr_number')
REQUIRED = ('number', 'meeting', 'date', 'region', 'field', 'title', 'request', 'status')

SR_PATTERN = re.compile(r'(?<![A-Za-z0-9])SR\s*[-–—]?\s*(\d+)(?![A-Za-z0-9])', re.IGNORECASE)

def separate_sr_number(organization, sr_number=''):
    numbers = []
    for value in re.split(r'[,;/\n]+', sr_number):
        if not value.strip():
            continue
        match = re.fullmatch(r'(?:SR\s*[-–—]?\s*)?(\d+)', value.strip(), re.IGNORECASE)
        if not match:
            raise ValueError('SR 번호는 SR-387379 형식으로 입력하세요. 여러 번호는 쉼표로 구분하세요.')
        numbers.append('SR-' + match[1])
    numbers.extend('SR-' + match[1] for match in SR_PATTERN.finditer(organization))
    if SR_PATTERN.search(organization):
        organization = SR_PATTERN.sub('', organization)
        organization = re.sub(r'([（(])\s*[,;/]+\s*', r'\1', organization)
        organization = re.sub(r'\s*[,;/]+\s*([）)])', r'\1', organization)
        organization = re.sub(r'[（(]\s*[）)]', '', organization)
        organization = re.sub(r'[ \t]{2,}', ' ', organization).strip(' ,;/')
    return organization, ', '.join(dict.fromkeys(numbers))

def field_values(value):
    return [part.strip() for part in re.split(r'\s*[·,、]\s*', value) if part.strip()]

def review_category(value):
    return next((s for s in REVIEW_STATUSES[1:] if value.startswith(s)), '미검토')

def convert_import(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict) or not isinstance(payload.get('records'), list) or not isinstance(payload.get('document'), dict):
        raise ValueError('JSON 배열 또는 document/records가 있는 전체 master JSON을 입력하세요.')
    document = payload['document']
    result = []
    known = document.get('sha256') == 'e00442781c2fccb6db3d1bdd40641c900f7535f8a9463141a51118dcab7331f8'
    for record in payload['records']:
        if not isinstance(record, dict) or not isinstance(record.get('agenda'), dict):
            raise ValueError('master JSON의 각 records 항목에는 agenda 객체가 필요합니다.')
        item = dict(record['agenda'])
        number = record.get('source_agenda_number', '')
        source_status = record.get('source_status', '')
        item.update(
            source_agenda_number=str(number), source_status=source_status,
            review_status=review_category(source_status) if isinstance(source_status, str) else source_status,
            list_status=record.get('list_status', ''), target_menu=record.get('target_menu', ''),
            additional_opinions=record.get('additional_opinions', ''),
            source_file=document.get('file_name', ''),
            meeting_location=document.get('meeting_location', ''), meeting_region=document.get('meeting_region', ''),
            # A pre-meeting review never establishes the final implementation status.
            status='미확인', answer='',
            source_record={'document': document, 'record': record},
        )
        pages = record.get('source_pdf_pages', [])
        if not isinstance(pages, list) or any(type(p) is not int or p < 1 for p in pages):
            raise ValueError('원문 PDF 쪽수는 양의 정수 배열이어야 합니다.')
        item['source_pages'] = ', '.join(map(str, pages))
        notes = record.get('review_notes', [])
        if not isinstance(notes, list) or any(not isinstance(n, str) for n in notes):
            raise ValueError('검수 메모는 문자열 배열이어야 합니다.')
        # Old conversion-only notes about unsupported statuses are obsolete in v2.
        notes = [n for n in notes if 'status 확인 후' not in n and '앱의 처리 상태를 확정하지' not in n]
        item['review_notes'] = '\n'.join(notes)
        request = item.get('request', '')
        if isinstance(request, str) and '\n\n[원문 개선방안]\n' in request:
            item['request'], item['improvement_plan'] = request.split('\n\n[원문 개선방안]\n', 1)
        review = item.get('review', '')
        if isinstance(review, str):
            item['review'] = re.sub(r'^\[원문 KERIS 검토의견:[^\n]*\]\s*', '', review).split('\n\n[출처]')[0].strip()
        # Preserve the original meeting-region value in source_record; don't use it as proposal region.
        organization = item.get('organization', '')
        if not isinstance(organization, str):
            raise ValueError('기관명은 문자열이어야 합니다.')
        regions = [('서울', ('서울',)), ('부산', ('부산',)), ('대구', ('대구',)), ('인천', ('인천',)), ('광주', ('광주',)), ('대전', ('대전',)), ('울산', ('울산',)), ('세종', ('세종',)), ('경기', ('경기도', '경기 ')), ('강원', ('강원',)), ('충북', ('충북', '충청북')), ('충남', ('충남', '충청남')), ('전북', ('전북',)), ('전남', ('전남', '전라남')), ('경북', ('경북', '경상북')), ('경남', ('경남', '경상남', '김해교육지원청')), ('제주', ('제주',))]
        item['region'] = next((name for name, prefixes in regions if organization.startswith(prefixes)), '전국' if organization == '교육부' else '미상')
        item['submission_type'] = record.get('submission_type', '미분류')
        if known and type(number) is int:
            item['submission_type'] = '교육부' if number == 1 else '협의체' if 2 <= number <= 19 else '기타' if 20 <= number <= 29 else 'SR' if 30 <= number <= 35 else '간담회' if 36 <= number <= 37 else '미분류'
        result.append(item)
    return result

def validate_provenance(value):
    if not isinstance(value, dict):
        raise ValueError('원문 보존 자료(source_record)는 JSON 객체여야 합니다.')
    try:
        size = len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8'))
    except (TypeError, ValueError, RecursionError) as exc:
        raise ValueError('원문 보존 자료는 올바른 JSON이어야 합니다.') from exc
    if size > 1024 * 1024:
        raise ValueError('안건별 원문 보존 자료는 1MB 이하여야 합니다.')
    return value
