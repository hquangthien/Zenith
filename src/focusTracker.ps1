param([int]$OwnPid = 0)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Native helpers: per-monitor-v2 DPI awareness + GetForegroundWindow for HWND reporting.
try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ZenithDpi {
    [DllImport("user32.dll")]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
}
public static class ZenithWin32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
}
'@ -ErrorAction SilentlyContinue
    # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
    [ZenithDpi]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
} catch { }

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

$lastSig = ''

while ($true) {
    try {
        $elt = [System.Windows.Automation.AutomationElement]::FocusedElement
        $sig = 'NONE'
        $suppress = $false

        if ($elt) {
            $procId = 0
            try { $procId = $elt.Current.ProcessId } catch { }

            if ($OwnPid -gt 0 -and $procId -eq $OwnPid) {
                # Our own window is focused (user is interacting with Zenith).
                $suppress = $true
                $lastSig = '__SELF__'
            } else {
                $isEditable = $false
                [object]$p = $null

                if ($elt.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) {
                    try { if (-not $p.Current.IsReadOnly) { $isEditable = $true } } catch { }
                }
                if (-not $isEditable -and $elt.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$p)) {
                    $isEditable = $true
                }

                if ($isEditable) {
                    $r = $null
                    try { $r = $elt.Current.BoundingRectangle } catch { }
                    if ($r -and $r.Width -gt 0 -and $r.Height -gt 0) {
                        $fgHwnd = 0
                        try { $fgHwnd = [ZenithWin32]::GetForegroundWindow().ToInt64() } catch { }
                        $sig = "FOCUS|$fgHwnd|$([int]$r.Left)|$([int]$r.Top)|$([int]$r.Right)|$([int]$r.Bottom)"
                    }
                }
            }
        }

        if (-not $suppress -and $sig -ne $lastSig) {
            [Console]::Out.WriteLine($sig)
            [Console]::Out.Flush()
            $lastSig = $sig
        }
    } catch {
        # swallow transient UIA errors
    }
    Start-Sleep -Milliseconds 200
}
