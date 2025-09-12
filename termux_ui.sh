#!/bin/bash
HEADER_BG="\e[48;5;27m"  # Blue
HEADER_FG="\e[38;5;207m" # Pink
RESET="\e[0m"
HEADER=" JCHAT Termux Interface "
clear
echo -e "${HEADER_BG}${HEADER_FG}${HEADER}$(printf '%*s' $(( $(tput cols) - ${#HEADER} )) '')${RESET}"
echo -e "\nScroll below to see messages. Press q to exit.\n"
for i in {1..50}; do
    echo -e "📂 $(basename "$PWD") | Message $i: Welcome to your JCHAT Termux interface!"
done | less -R
