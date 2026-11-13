// Kleines Terminal. Die Netzwerk-Befehle sind gespielt, es geht kein Paket raus.

const FILES = {
  'ueber-mich.txt': 'about',
  'werdegang.log': 'werdegang',
  'projekte/': 'firewall',
  'projekte/firewall-umzug': 'firewall',
  'projekte/litho.ch': 'litho',
  'projekte/smart-fridge': 'fridge',
  'kontakt': 'kontakt',
  'ueber-diese-seite.txt': 'seite',
};

const HELP = [
  ['help', 'diese Liste'],
  ['whoami', 'wer hier schreibt'],
  ['ls', 'Dateien anzeigen'],
  ['open <name>', 'Fenster öffnen, z. B. open projekte/litho.ch'],
  ['skills', 'Werkzeuge, mit denen ich arbeite'],
  ['ping <host>', 'gespielter Ping'],
  ['traceroute', 'mein Weg bis hierher'],
  ['mail', 'Mailadresse'],
  ['clear', 'Ausgabe leeren'],
];

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function initTerminal(desktop) {
  const out = document.getElementById('term-out');
  const form = document.getElementById('term-form');
  const input = document.getElementById('term-in');
  const body = document.getElementById('term');
  if (!form) return { focus() {} };
  const history = [];
  let at = 0;

  const print = (html) => {
    out.insertAdjacentHTML('beforeend', `${html}\n`);
    body.scrollTop = body.scrollHeight;
  };

  const run = (raw) => {
    const line = raw.trim();
    print(`<span class="ok">matteo@zrh:~$</span> <span class="cmd">${esc(line)}</span>`);
    if (!line) return;
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd.toLowerCase()) {
      case 'help':
        HELP.forEach(([c, d]) => print(`  ${esc(c.padEnd(14))}<span class="dim">${d}</span>`));
        break;
      case 'whoami':
        print('Matteo Lehnert, Informatiker EFZ Plattformentwicklung in Ausbildung.\nSunrise, Zürich. Lehrabschluss im Sommer 2027.');
        break;
      case 'ls':
        Object.keys(FILES).filter((f) => !f.includes('/') || f.endsWith('/') ).forEach((f) => print(`  ${f}`));
        print('<span class="dim">  ls projekte zeigt die drei Projekte</span>');
        if (arg.startsWith('projekte')) Object.keys(FILES).filter((f) => f.startsWith('projekte/') && f.length > 9).forEach((f) => print(`  ${f}`));
        break;
      case 'open':
      case 'cat':
      case 'cd': {
        const key = Object.keys(FILES).find((f) => f.replace(/\/$/, '') === arg.replace(/\/$/, '') || f.split('/').pop() === arg);
        if (key) { print(`<span class="dim">öffne ${key}</span>`); desktop.open(FILES[key]); }
        else print(`${esc(cmd)}: ${esc(arg || '?')} gibt es hier nicht. Probier ls.`);
        break;
      }
      case 'skills':
        print('Netz    Cisco IOS, Huawei VRP, Juniper Junos, BGP, OSPF, MPLS\nServer  Red Hat, Debian, Ansible, Terraform, OpenStack, Docker\nCode    Python, Bash, Git, JavaScript, C++ für ESP32');
        break;
      case 'ping': {
        const host = esc(arg || 'matteolehnert.com');
        print(`PING ${host} <span class="dim">(gespielt)</span>`);
        [0, 1, 2].forEach((i) => setTimeout(() => print(`64 bytes von ${host}: seq=${i + 1} zeit=${(8 + Math.random() * 9).toFixed(1)} ms`), 350 * (i + 1)));
        break;
      }
      case 'traceroute':
        ['2007  Jahrgang', '2023  Lehrbeginn bei Sunrise, Zürich', '2025  litho.ch geht online', '2026  Praktikum bei Nrlyze, Stockholm', '2027  Lehrabschluss'].forEach((h, i) => print(` ${i + 1}  ${h}`));
        break;
      case 'mail':
      case 'kontakt':
        print('matteolehnert@gmail.com');
        desktop.open('kontakt');
        break;
      case 'clear':
        out.textContent = '';
        break;
      case 'sudo':
        print('Netter Versuch.');
        break;
      case 'exit':
        desktop.close('terminal');
        break;
      default:
        print(`${esc(cmd)}: Befehl nicht gefunden. help zeigt, was geht.`);
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    if (v.trim()) { history.push(v); at = history.length; }
    input.value = '';
    run(v);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && at > 0) { at -= 1; input.value = history[at]; e.preventDefault(); }
    if (e.key === 'ArrowDown') { at = Math.min(history.length, at + 1); input.value = history[at] || ''; e.preventDefault(); }
  });
  body.addEventListener('click', () => { if (!window.getSelection().toString()) input.focus({ preventScroll: true }); });

  print('MatteOS Terminal. <span class="dim">help zeigt die Befehle.</span>');
  return { focus: () => input.focus({ preventScroll: true }) };
}
