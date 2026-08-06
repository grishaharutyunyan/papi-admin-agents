#!/bin/sh
# Custom Claude Code statusline.
# Renders: <model> ·<effort> | Chat:<%> | 5h:<%> <HH:MM> | 7d:<%> <N>d | <folder> | <branch>
# Reads the Claude Code status JSON from stdin.

input=$(cat)

# --- ANSI colors ---
E=$(printf '\033')
RESET="${E}[0m"
DIM="${E}[2m"
BOLD_CYAN="${E}[1;36m"
BOLD_BLUE="${E}[1;34m"
YELLOW="${E}[33m"
GREEN="${E}[32m"
RED="${E}[31m"
MAGENTA="${E}[35m"

SEP="${DIM} | ${RESET}"

# --- color a whole-number percentage: green <50, yellow 50-79, red >=80 ---
pct_color() {
  n=$1
  if [ "$n" -ge 80 ]; then
    printf '%s' "$RED"
  elif [ "$n" -ge 50 ]; then
    printf '%s' "$YELLOW"
  else
    printf '%s' "$GREEN"
  fi
}

# --- parse fields (missing numerics default to 0, optionals to empty) ---
model=$(printf '%s' "$input"  | jq -r '.model.display_name // "Unknown Model"')
effort=$(printf '%s' "$input" | jq -r '.effort.level // empty')
ctx=$(printf '%s' "$input"    | jq -r '.context_window.used_percentage // 0')
cwd=$(printf '%s' "$input"    | jq -r '.workspace.current_dir // .cwd // empty')
h5=$(printf '%s' "$input"     | jq -r '.rate_limits.five_hour.used_percentage // 0')
h5_reset=$(printf '%s' "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
d7=$(printf '%s' "$input"     | jq -r '.rate_limits.seven_day.used_percentage // 0')
d7_reset=$(printf '%s' "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

# round percentages to whole numbers
ctx_i=$(printf '%.0f' "$ctx" 2>/dev/null || echo 0)
h5_i=$(printf '%.0f' "$h5" 2>/dev/null || echo 0)
d7_i=$(printf '%.0f' "$d7" 2>/dev/null || echo 0)

# strip any fractional part from epoch reset values
h5_reset=${h5_reset%%.*}
d7_reset=${d7_reset%%.*}

# --- segment 1: model (+ optional effort) ---
out="${BOLD_CYAN}${model}${RESET}"
if [ -n "$effort" ]; then
  out="${out} ${DIM}·${RESET}${YELLOW}${effort}${RESET}"
fi

# --- segment 2: Chat context % ---
c=$(pct_color "$ctx_i")
out="${out}${SEP}${DIM}Chat:${RESET}${c}${ctx_i}%${RESET}"

# --- segment 3: 5h rate limit (+ optional reset HH:MM) ---
c=$(pct_color "$h5_i")
seg="${DIM}5h:${RESET}${c}${h5_i}%${RESET}"
if [ -n "$h5_reset" ]; then
  t=$(date -r "$h5_reset" "+%H:%M" 2>/dev/null || date -d "@$h5_reset" "+%H:%M" 2>/dev/null)
  [ -n "$t" ] && seg="${seg} ${DIM}${t}${RESET}"
fi
out="${out}${SEP}${seg}"

# --- segment 4: 7d rate limit (+ optional days-until-reset, ceiling) ---
c=$(pct_color "$d7_i")
seg="${DIM}7d:${RESET}${c}${d7_i}%${RESET}"
if [ -n "$d7_reset" ]; then
  now=$(date +%s)
  diff=$(( d7_reset - now ))
  [ "$diff" -lt 0 ] && diff=0
  days=$(( (diff + 86399) / 86400 ))
  seg="${seg} ${DIM}${days}d${RESET}"
fi
out="${out}${SEP}${seg}"

# --- segment 5: current folder basename ---
if [ -n "$cwd" ]; then
  folder=$(basename "$cwd")
  out="${out}${SEP}${BOLD_BLUE}${folder}${RESET}"

  # --- segment 6: git branch (omit if not a repo) ---
  branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
  [ -n "$branch" ] && out="${out}${SEP}${MAGENTA}${branch}${RESET}"
fi

printf '%s' "$out"
