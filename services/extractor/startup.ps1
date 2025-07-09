# Import Microsoft-Extractor-Suite module on startup
Import-Module Microsoft-Extractor-Suite -Force
Write-Host "Microsoft-Extractor-Suite module imported successfully"

# Keep the container running
exec node src/index.js