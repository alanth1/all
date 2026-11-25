# Etsy Business OS - first-run bootstrap (Windows).
# Downloads a private, portable Python (python.org "embeddable" build) into .\runtime\python,
# installs pip and the libraries from requirements.txt. Nothing is installed system-wide.
param([switch]$OnlyRequirements)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Root "runtime"
$Py = Join-Path $Runtime "python"
$Logs = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $Runtime, $Logs | Out-Null
$Log = Join-Path $Logs "setup.log"
Start-Transcript -Path $Log -Append | Out-Null

function Download($url, $out) {
  for ($i = 1; $i -le 4; $i++) {
    try {
      Write-Host "Downloading $url (try $i)"
      Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
      return $true
    } catch {
      Write-Host "  failed: $($_.Exception.Message)"
      Start-Sleep -Seconds (2 * $i)
    }
  }
  return $false
}

try {
  if (-not $OnlyRequirements) {
    if (-not (Test-Path (Join-Path $Py "python.exe"))) {
      $zip = Join-Path $Runtime "python.zip"
      $ok = $false
      foreach ($v in @("3.13.9", "3.13.7", "3.13.5", "3.13.3")) {
        $url = "https://www.python.org/ftp/python/$v/python-$v-embed-amd64.zip"
        if (Download $url $zip) { $ok = $true; break }
      }
      if (-not $ok) { throw "Could not download Python. Check the internet connection." }
      Expand-Archive -Path $zip -DestinationPath $Py -Force
      Remove-Item $zip
      # Enable site-packages and let Python import the app folder.
      $pth = Get-ChildItem -Path $Py -Filter "python*._pth" | Select-Object -First 1
      $zipName = (Get-ChildItem -Path $Py -Filter "python3*.zip" | Select-Object -First 1).Name
      Set-Content -Path $pth.FullName -Encoding ASCII -Value @($zipName, ".", "Lib\site-packages", "..\..", "import site")
    }
    $getpip = Join-Path $Runtime "get-pip.py"
    if (-not (Test-Path (Join-Path $Py "Scripts\pip.exe"))) {
      if (-not (Download "https://bootstrap.pypa.io/get-pip.py" $getpip)) { throw "Could not download pip." }
      & (Join-Path $Py "python.exe") $getpip --no-warn-script-location
      if ($LASTEXITCODE -ne 0) { throw "pip installation failed." }
    }
  }
  $req = Join-Path $Root "requirements.txt"
  & (Join-Path $Py "python.exe") -m pip install --no-warn-script-location --disable-pip-version-check -r $req
  if ($LASTEXITCODE -ne 0) { throw "Library installation failed." }
  Copy-Item $req (Join-Path $Runtime "requirements.installed") -Force
  Set-Content -Path (Join-Path $Runtime ".ready") -Value (Get-Date).ToString("s")
  Write-Host "Setup complete."
  Stop-Transcript | Out-Null
  exit 0
} catch {
  Write-Host "SETUP ERROR: $($_.Exception.Message)"
  Stop-Transcript | Out-Null
  exit 1
}
