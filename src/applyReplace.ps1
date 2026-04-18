param(
    [Int64]$Hwnd = 0,
    [Int32]$DelayMs = 150
)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ZenKB {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
'@ -ErrorAction SilentlyContinue

# Let Zenith finish hiding and the previous window settle.
Start-Sleep -Milliseconds $DelayMs

# Force-activate the target editable window if we have its HWND.
# AttachThreadInput is the documented workaround for Windows' foreground-lock restrictions.
if ($Hwnd -ne 0) {
    $target = [IntPtr]::new($Hwnd)
    try {
        if ([ZenKB]::IsIconic($target)) {
            [ZenKB]::ShowWindow($target, 9) | Out-Null  # SW_RESTORE
        }
        $currentTid = [ZenKB]::GetCurrentThreadId()
        $fgHwnd = [ZenKB]::GetForegroundWindow()
        $fgTid = [ZenKB]::GetWindowThreadProcessId($fgHwnd, [IntPtr]::Zero)
        if ($fgTid -ne $currentTid) {
            [ZenKB]::AttachThreadInput($currentTid, $fgTid, $true) | Out-Null
            [ZenKB]::SetForegroundWindow($target) | Out-Null
            [ZenKB]::AttachThreadInput($currentTid, $fgTid, $false) | Out-Null
        } else {
            [ZenKB]::SetForegroundWindow($target) | Out-Null
        }
        Start-Sleep -Milliseconds 60
    } catch { }
}

# Send Ctrl+V via keybd_event — more reliable than SendKeys for modifier combos.
$VK_CONTROL = 0x11
$VK_V = 0x56
$KEYEVENTF_KEYUP = 0x0002

[ZenKB]::keybd_event([byte]$VK_CONTROL, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 15
[ZenKB]::keybd_event([byte]$VK_V, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[ZenKB]::keybd_event([byte]$VK_V, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 15
[ZenKB]::keybd_event([byte]$VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
