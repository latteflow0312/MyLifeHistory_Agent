# MyLifeHistory - 01_RAW 신규 기록 파일 생성
#
# 파일명/저장 위치를 사용자가 직접 정하지 않도록, 현재 날짜+시간 기준으로
# 01_RAW에 최소 Markdown 템플릿 파일을 만들고 기본 편집기(Notepad)로 연다.
#
# Production JS 코드, Processing State, Gemini/API 호출, Daily Finalize
# 실행과는 전혀 무관하다 - 오직 새 RAW 기록 파일 1개를 만들 뿐이다.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$rawDir = 'G:\내 드라이브\MY_LIFE_HISTORY\01_RAW'

if (-not (Test-Path -LiteralPath $rawDir)) {
    Write-Host "FAIL: 01_RAW 폴더를 찾을 수 없습니다: $rawDir"
    exit 1
}

$now = Get-Date
$datePart = $now.ToString('yyyy-MM-dd')

# 같은 분 안에 충돌하면 초 단위로, 그래도 충돌하면 번호를 붙여 유일한
# 파일명을 찾는다 - 기존 파일을 절대 덮어쓰지 않는다.
$candidate = Join-Path $rawDir ("{0}_{1}_note.md" -f $datePart, $now.ToString('HHmm'))

if (Test-Path -LiteralPath $candidate) {
    $candidate = Join-Path $rawDir ("{0}_{1}_note.md" -f $datePart, $now.ToString('HHmmss'))
}

$suffix = 2
while (Test-Path -LiteralPath $candidate) {
    $candidate = Join-Path $rawDir ("{0}_{1}_note_{2}.md" -f $datePart, $now.ToString('HHmmss'), $suffix)
    $suffix++
}

$timestampLabel = $now.ToString('yyyy-MM-dd HH:mm')
$template = "# 기록`r`n`r`n작성시각: $timestampLabel`r`n`r`n## 내용`r`n`r`n"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($candidate, $template, $utf8NoBom)

Write-Host "생성됨: $candidate"

Start-Process -FilePath 'notepad.exe' -ArgumentList "`"$candidate`""

exit 0
