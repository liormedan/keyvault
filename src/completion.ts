// Shell completion scripts for `kv completion <shell>`. Commands and flags only — completing project or
// key names would mean unlocking the vault from a shell hook, which kv never does.

export const COMMANDS = [
  "init",
  "set",
  "get",
  "copy",
  "ls",
  "rm",
  "run",
  "env",
  "init-project",
  "example",
  "check",
  "mv",
  "push",
  "pull",
  "diff",
  "guard",
  "scan",
  "doctor",
  "import",
  "import-passwords",
  "audit",
  "browser",
  "export",
  "restore",
  "ui",
  "unlock",
  "forget",
  "backup",
  "passwd",
  "lang",
  "status",
  "completion",
  "help",
] as const;

const FLAGS: Partial<Record<(typeof COMMANDS)[number], string[]>> = {
  set: ["--note", "--env"],
  get: ["--show", "--env"],
  copy: ["--env"],
  rm: ["--env"],
  run: ["--env", "--"],
  env: ["--env", "--format", "--show", "sh", "pwsh", "fish", "dotenv", "json"],
  "init-project": ["--env", "--force"],
  check: ["--file", "--env"],
  push: ["vercel", "github", "--env", "--target", "--sensitive", "--repo", "--environment", "--dry-run"],
  pull: ["vercel", "--env", "--target"],
  guard: ["install", "uninstall", "--all", "--strict", "--force"],
  scan: ["--json", "--import"],
  diff: ["vercel", "github", "--env", "--target", "--repo", "--environment", "--json"],
  ls: ["--json"],
  status: ["--json"],
  unlock: ["--remember"],
  "import-passwords": ["--delete"],
  audit: ["--breaches", "--json"],
  browser: ["status", "enable", "disable", "--json"],
  export: ["--recovery-code"],
  restore: ["--force"],
  lang: ["en", "he"],
  completion: ["bash", "zsh", "fish", "powershell"],
};

export const SHELLS = ["bash", "zsh", "fish", "powershell"] as const;
export type Shell = (typeof SHELLS)[number];

export function completion(shell: Shell): string {
  const cmds = COMMANDS.join(" ");
  const cases = Object.entries(FLAGS).map(([c, f]) => [c, f.join(" ")] as const);
  switch (shell) {
    case "bash":
      return [
        "# kv completion — add to ~/.bashrc:  source <(kv completion bash)",
        "_kv() {",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax in the generated script, not a JS template
        '  local cur="${COMP_WORDS[COMP_CWORD]}"',
        `  if [ "$COMP_CWORD" -eq 1 ]; then COMPREPLY=($(compgen -W "${cmds}" -- "$cur")); return; fi`,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax in the generated script, not a JS template
        '  case "${COMP_WORDS[1]}" in',
        ...cases.map(([c, f]) => `    ${c}) COMPREPLY=($(compgen -W "${f}" -- "$cur")) ;;`),
        "  esac",
        "}",
        "complete -F _kv kv",
        "",
      ].join("\n");
    case "zsh":
      return [
        "#compdef kv",
        "# kv completion — add to ~/.zshrc:  source <(kv completion zsh)",
        "_kv() {",
        `  if (( CURRENT == 2 )); then compadd -- ${cmds}; return; fi`,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: shell syntax in the generated script, not a JS template
        "  case ${words[2]} in",
        ...cases.map(([c, f]) => `    ${c}) compadd -- ${f} ;;`),
        "  esac",
        "}",
        "compdef _kv kv",
        "",
      ].join("\n");
    case "fish":
      return [
        "# kv completion — save as ~/.config/fish/completions/kv.fish",
        `complete -c kv -f -n "__fish_use_subcommand" -a "${cmds}"`,
        ...cases.map(([c, f]) => `complete -c kv -f -n "__fish_seen_subcommand_from ${c}" -a "${f}"`),
        "",
      ].join("\n");
    case "powershell":
      return [
        "# kv completion — add to $PROFILE:  kv completion powershell | Out-String | Invoke-Expression",
        "Register-ArgumentCompleter -Native -CommandName kv -ScriptBlock {",
        "  param($word, $ast)",
        "  $words = $ast.CommandElements | ForEach-Object { $_.ToString() }",
        `  $options = if ($words.Count -le 2 -and -not ($words.Count -eq 2 -and $word -eq '')) { '${cmds}' -split ' ' } else {`,
        "    switch ($words[1]) {",
        ...cases.map(([c, f]) => `      '${c}' { '${f}' -split ' ' }`),
        "      default { @() }",
        "    }",
        "  }",
        '  $options | Where-Object { $_ -like "$word*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_) }',
        "}",
        "",
      ].join("\n");
  }
}
