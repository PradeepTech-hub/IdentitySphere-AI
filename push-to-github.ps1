# Push IdentitySphere to GitHub as 123spandu
# Run: powershell -ExecutionPolicy Bypass -File push-to-github.ps1

$Gh = "C:\Program Files\GitHub CLI\gh.exe"
$Project = $PSScriptRoot

Set-Location $Project

Write-Host "=== GitHub login (account: 123spandu) ===" -ForegroundColor Cyan
& $Gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Opening device login. Sign in as: https://github.com/123spandu" -ForegroundColor Yellow
    & $Gh auth login -h github.com -p https -w
}

Write-Host "`n=== Pushing to pradi1626-16/IdentitySphere ===" -ForegroundColor Cyan
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSuccess! View: https://github.com/pradi1626-16/IdentitySphere" -ForegroundColor Green
} else {
    Write-Host "`nPush failed. Ask pradi1626-16 to add 123spandu as a collaborator on the repo." -ForegroundColor Red
}
