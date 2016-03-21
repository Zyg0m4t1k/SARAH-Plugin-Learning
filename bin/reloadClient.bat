SET PluginDirectoryBin=%~dp0
SET PowerShellScriptPath=%PluginDirectoryBin%reloadClient.ps1
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "& '%PowerShellScriptPath%' '%PluginDirectoryBin%'";
