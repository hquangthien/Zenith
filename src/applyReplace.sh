#!/bin/bash

# macOS apply replace using AppleScript
# Simulates Cmd+V to paste

delay_ms=$1
if [ -z "$delay_ms" ]; then
    delay_ms=150
fi

# Wait for the delay
sleep $(echo "scale=3; $delay_ms / 1000" | bc)

# Send Cmd+V
osascript <<EOF
tell application "System Events"
    keystroke "v" using command down
end tell
EOF