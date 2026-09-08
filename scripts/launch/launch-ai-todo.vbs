Option Explicit

Dim shell, fileSystem, launcherPath, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
launcherPath = fileSystem.BuildPath(fileSystem.GetParentFolderName(WScript.ScriptFullName), "launch-ai-todo.ps1")
command = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & launcherPath & Chr(34)
shell.Run command, 0, False
