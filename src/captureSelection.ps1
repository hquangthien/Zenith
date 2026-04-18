# Sends Ctrl+C to whatever window currently holds foreground.
# Caller (Zenith main) guarantees the target app is foreground (the FAB window is non-focusable,
# so clicking it doesn't steal activation from the user's app).

$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ZenCopy {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
'@ -ErrorAction SilentlyContinue

$VK_CONTROL = 0x11
$VK_C = 0x43
$KEYEVENTF_KEYUP = 0x0002

[ZenCopy]::keybd_event([byte]$VK_CONTROL, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 15
[ZenCopy]::keybd_event([byte]$VK_C, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[ZenCopy]::keybd_event([byte]$VK_C, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 15
[ZenCopy]::keybd_event([byte]$VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
