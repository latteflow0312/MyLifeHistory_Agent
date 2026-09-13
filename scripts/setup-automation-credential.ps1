# MyLifeHistory - 무인 실행용 Credential 최초 등록
#
# Gemini API Key를 Windows DPAPI(현재 사용자 계정 종속)로 암호화하여
# %LOCALAPPDATA%\MyLifeHistory\ 에 저장한다. Google Drive나 프로젝트
# 폴더에는 절대 저장하지 않는다. 평문 API Key는 어디에도 기록되지 않는다.
# 저장된 파일은 등록한 것과 동일한 Windows 계정에서만 복호화할 수 있다.
#
# 이 파일은 등록 전용이다 - Windows Task Scheduler 등록이나 실제
# Production 실행은 하지 않는다.
#
# 사용법:
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-automation-credential.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$credentialDir = Join-Path $env:LOCALAPPDATA 'MyLifeHistory'
$credentialPath = Join-Path $credentialDir 'gemini-api-key.cred'

function ConvertFrom-SecureStringPlain {
    param([System.Security.SecureString]$Secure)
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Test-HasControlChar {
    param([string]$Value)
    foreach ($ch in $Value.ToCharArray()) {
        $code = [int][char]$ch
        if ($code -lt 32 -or $code -eq 127) {
            return $true
        }
    }
    return $false
}

Write-Host 'MyLifeHistory 자동 실행용 Credential 등록'
Write-Host 'Gemini API Key를 입력하세요 (입력값은 화면에 표시되지 않습니다):'
$secureKey = Read-Host -AsSecureString
$plainKey = $null

try {
    $plainKey = ConvertFrom-SecureStringPlain -Secure $secureKey

    if ([string]::IsNullOrEmpty($plainKey)) {
        Write-Host 'FAIL: API Key가 비어 있습니다. 저장하지 않았습니다.'
        exit 1
    }
    if (Test-HasControlChar -Value $plainKey) {
        Write-Host 'FAIL: API Key에 허용되지 않는 제어 문자가 포함되어 있습니다. 저장하지 않았습니다.'
        exit 1
    }

    if (-not (Test-Path -LiteralPath $credentialDir)) {
        New-Item -ItemType Directory -Path $credentialDir -Force | Out-Null
    }

    # DPAPI: 원본 SecureString을 그대로 암호화한다 (-Key 미지정 = 현재
    # Windows 사용자 계정에 종속). 다른 계정/다른 컴퓨터에서는 복호화할 수 없다.
    $encrypted = ConvertFrom-SecureString -SecureString $secureKey
    Set-Content -LiteralPath $credentialPath -Value $encrypted -Encoding ASCII -NoNewline

    Write-Host "저장됨: $credentialPath"
    Write-Host '이 파일은 현재 Windows 계정에서만 복호화할 수 있습니다.'
}
finally {
    $plainKey = $null
}

exit 0
