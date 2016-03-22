$baseDir=$args[0]
$sarah= get-process WSRMacro
start-sleep -s 5
$sarah.kill()
Start-Process "$baseDir\..\..\..\Client_Microphone.cmd"
