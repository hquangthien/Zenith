#!/bin/bash

# macOS focus tracker using AppleScript
# Outputs similar to PowerShell: FOCUS|0|left|top|right|bottom or NONE

while true; do
    output=$(osascript -e '
try
    tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        tell process frontApp
            set frontWin to front window
            if frontWin is not missing value then
                set focusedElt to (focused of frontWin)
                if focusedElt is not missing value then
                    set role to role of focusedElt
                    if role is "AXTextField" or role is "AXTextArea" or role is "AXComboBox" then
                        set pos to position of focusedElt
                        set sz to size of focusedElt
                        if pos is not missing value and sz is not missing value then
                            set x to item 1 of pos
                            set y to item 2 of pos
                            set w to item 1 of sz
                            set h to item 2 of sz
                            "FOCUS|0|" & (x as string) & "|" & (y as string) & "|" & ((x + w) as string) & "|" & ((y + h) as string)
                        else
                            "NONE"
                        end if
                    else
                        "NONE"
                    end if
                else
                    "NONE"
                end if
            else
                "NONE"
            end if
        end tell
    end tell
on error
    "NONE"
end try
')

    echo "$output"
    sleep 0.2
done