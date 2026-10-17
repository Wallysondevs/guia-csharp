#!/usr/bin/env node
/* Testa as caixas "Experimente" (.trycs) das páginas com o MESMO motor que o navegador usa
   (o Roslyn do laboratório, C# 14, e o .NET 10 em WebAssembly: os arquivos de assets/cs/), sem npm install.

   node tools/testar-missoes.js                 todas as páginas *.html
   node tools/testar-missoes.js laços.html …    só estas
   opções:
     -v, --verboso   mostra a saída de cada execução
     --nativo        compila e roda também com o dotnet do laboratório e mostra as
                     diferenças (informativo: não conta como falha, mas a meta TEM de ser
                     cumprida pela solução também no laboratório)
     --sem-cache     ignora tools/.cache-missoes.json

   Para cada missão (com data-goal):
     1. o código inicial NÃO pode cumprir a meta;
     2. a solução (pre.solucao) TEM de cumprir a meta.
   Caixas livres (sem data-goal): só compila e roda, e avisa se não compilar.
   Confere também o contrato: "<" e "&" escapados nos <pre>, metas conhecidas,
   regex válidas, solução presente.
   Sai com código 1 se alguma missão falhar. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Sim = require("../assets/csharpsim.js");
const C = require("./cs-node.js");

const RAIZ = path.resolve(__dirname, "..");
const CACHE = path.join(__dirname, ".cache-missoes.json");

/* ---------- leitura das páginas (sem navegador) ---------- */
// atributos de uma tag, respeitando as aspas (um ">" dentro de data-goal="…" é HTML válido)
const ATTRS = "(?:[^>\"']|\"[^\"]*\"|'[^']*')*";
function attrs(tag) {
  const r = {}, re = /([\w:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  tag = tag.replace(/^<\w+/, "").replace(/\/?>$/, "");
  while ((m = re.exec(tag))) r[m[1].toLowerCase()] = Sim.decodificarEntidades(m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5] !== undefined ? m[5] : "");
  return r;
}
function temClasse(a, c) { return (" " + (a["class"] || "") + " ").indexOf(" " + c + " ") >= 0; }
// [{linha, a, interno}] de cada <div class="tryc">…</div> (com divs aninhadas)
function caixas(html) {
  const r = [], re = new RegExp("<div\\b" + ATTRS + ">", "gi");
  let m;
  while ((m = re.exec(html))) {
    const a = attrs(m[0]);
    if (!temClasse(a, "trycs")) continue;
    let prof = 1, x;
    const t = new RegExp("</?div\\b" + ATTRS + ">", "gi"); t.lastIndex = re.lastIndex;
    while ((x = t.exec(html))) { if (x[0][1] === "/") { if (--prof === 0) break; } else prof++; }
    const fim = x ? x.index : html.length;
    r.push({ linha: html.slice(0, m.index).split("\n").length, a, interno: html.slice(re.lastIndex, fim) });
    re.lastIndex = fim;
  }
  return r;
}
function pres(interno, classe) {
  const r = [], re = new RegExp("<pre\\b" + ATTRS + ">([\\s\\S]*?)</pre>", "gi");
  let m;
  while ((m = re.exec(interno))) {
    const a = attrs(new RegExp("^<pre\\b" + ATTRS + ">", "i").exec(m[0])[0]);
    if (!temClasse(a, classe)) continue;
    let codigo = Sim.decodificarEntidades(m[1]).replace(/^\n/, "").replace(/\n$/, "");
    // aba de dados (.txt, .csv…): termina com Enter, como um arquivo de verdade (igual ao assets/csharpsim.js)
    if (a["data-file"] && !/\.cs$/i.test(a["data-file"]) && codigo !== "" && !codigo.endsWith("\n")) codigo += "\n";
    r.push({ arquivo: a["data-file"] || null, bruto: m[1], codigo: codigo });
  }
  return r;
}
// "<" ou "&" sem escapar dentro do <pre> (o navegador come "<stdio.h>" achando que é uma tag)
function problemasDeEscape(bruto) {
  const p = [];
  const tag = /<[A-Za-z\/!?][^>]*>?/.exec(bruto);
  if (tag) p.push("\"" + tag[0].slice(0, 30) + "\" sem escapar dentro do <pre> (escreva &lt; … &gt;)");
  const amp = /&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/.exec(bruto);
  if (amp) p.push("\"&\" sem escapar dentro do <pre> (escreva &amp;): …" + bruto.slice(Math.max(0, amp.index - 15), amp.index + 10).replace(/\n/g, " ") + "…");
  return p;
}

function trecho(s, n) { s = String(s || "").replace(/\n$/, ""); const l = s.split("\n"); return (l.length > n ? l.slice(0, n).concat(["… (" + (l.length - n) + " linhas a mais)"]) : l).map((x) => "        │ " + x).join("\n"); }
function mostrarExec(r) {
  if (!r.compilou) return "      não compilou:\n" + trecho(r.diagTexto, 12);
  return (r.diagTexto ? "      compilador:\n" + trecho(r.diagTexto, 6) + "\n" : "") + "      saída [exit " + r.exit + "]:\n" + trecho(r.saida, 15);
}

async function main() {
  const argv = process.argv.slice(2);
  const verboso = argv.includes("-v") || argv.includes("--verboso");
  const nativo = argv.includes("--nativo");
  const semCache = argv.includes("--sem-cache") || nativo || verboso;
  let paginas = argv.filter((x) => !x.startsWith("-"));
  if (!paginas.length) paginas = fs.readdirSync(RAIZ).filter((f) => f.endsWith(".html")).sort();
  const Lab = nativo ? require("./lab-nativo.js") : null;

  const man = C.versao();
  const versaoMotor = crypto.createHash("sha1").update(["../assets/csharpsim.js", "cs-node.js", "cs-executor-node.mjs", "testar-missoes.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\0") + (man ? man.versao : "")).digest("hex");
  let cache = {};
  try { const c = JSON.parse(fs.readFileSync(CACHE, "utf8")); if (c.versao === versaoMotor) cache = c.itens || {}; } catch (e) { /* sem cache */ }
  const novoCache = {};

  let nMissoes = 0, nLivres = 0, nFalhas = 0, nAvisos = 0, nCache = 0, nDifNativo = 0;
  for (const pag of paginas) {
    const arq = path.isAbsolute(pag) ? pag : fs.existsSync(pag) ? pag : path.join(RAIZ, pag);
    if (!fs.existsSync(arq)) { console.log("✗ " + pag + ": arquivo não encontrado"); nFalhas++; continue; }
    const html = fs.readFileSync(arq, "utf8");
    const lista = caixas(html);
    const saidaPag = [];
    let falhasPag = 0;
    // os outros <pre> da página (pre.file, pre.term…): "<" e "&" também precisam de escape
    {
      const re = new RegExp("<pre\\b" + ATTRS + ">([\\s\\S]*?)</pre>", "gi");
      let m;
      while ((m = re.exec(html))) {
        const a = attrs(new RegExp("^<pre\\b" + ATTRS + ">", "i").exec(m[0])[0]);
        if (temClasse(a, "script") || temClasse(a, "solucao")) continue;
        // dentro do pre.term o site já usa <span>…; só conta o que não é tag de formatação
        const bruto = m[1].replace(/<\/?(span|b|i|em|strong|u|mark|a|br|kbd|code|var|samp|sub|sup)\b[^>]*>/gi, "");
        const p = problemasDeEscape(bruto);
        if (p.length) { nFalhas++; falhasPag++; saidaPag.push("  ✗ linha " + html.slice(0, m.index).split("\n").length + " <pre" + (a["class"] ? " class=\"" + a["class"] + "\"" : "") + ">\n" + p.map((x) => "      " + x).join("\n")); }
      }
      if (/class\s*=\s*["'](?:[^"']*\s)?(tryc|trycpp|tryjshell)(?=["'\s])/.test(html)) { nFalhas++; falhasPag++; saidaPag.push("  ✗ a página usa class=\"tryc\"/\"trycpp\" (de outro guia); no Guia C# a caixa é class=\"trycs\""); }
    }
    if (!lista.length && !saidaPag.length) continue;
    for (const c of lista) {
      const a = c.a;
      const padrao = a["data-file"] || "Program.cs";
      const scripts = pres(c.interno, "script"), sols = pres(c.interno, "solucao");
      const meta = a["data-goal"] || "";
      const rot = "linha " + c.linha + (meta ? " missão [" + meta + "]" : " (livre)");
      const problemas = [], avisos = [];
      for (const p of scripts.concat(sols)) problemas.push(...problemasDeEscape(p.bruto));
      if (!scripts.length) problemas.push("caixa sem <pre class=\"script\">");
      if (meta && !sols.length) problemas.push("missão sem <pre class=\"solucao\">");
      const metas = Sim.dividirMetas(meta);
      metas.forEach((g) => { if (!/^(out|outre|erro|aviso|exit|src):|^(compila|semaviso)$/.test(g.trim())) problemas.push("meta desconhecida ou sem valor: \"" + g + "\" (use " + Sim.META_NOMES.join(", ") + ")"); });
      metas.forEach((g) => {
        const i = g.indexOf(":"), tipo = g.slice(0, i), v = g.slice(i + 1);
        try {
          if (tipo === "outre" || tipo === "src") new RegExp(v);
          if ((tipo === "erro" || tipo === "aviso") && /^\//.test(v) && !Sim.regexDe(v)) throw new Error("falta a / do fim");
          if (tipo === "erro" || tipo === "aviso") Sim.regexDe(v);
        } catch (e) { problemas.push("regex inválida em \"" + g + "\": " + e.message); }
        if (tipo === "exit" && !/^\s*\d+\s*$/.test(v)) problemas.push("exit: precisa de um número: \"" + g + "\"");
      });
      if (problemas.length) {
        nFalhas++; falhasPag++;
        saidaPag.push("  ✗ " + rot + "\n" + problemas.map((p) => "      " + p).join("\n"));
        continue;
      }
      const abas = scripts.map((p, i) => ({ nome: p.arquivo || (i === 0 ? padrao : "Arquivo" + i + ".cs"), codigo: p.codigo }));
      const solucao = abas.map((x) => ({ nome: x.nome, codigo: x.codigo }));
      sols.forEach((s, i) => {
        const nome = s.arquivo || (abas[i] ? abas[i].nome : padrao);
        const alvo = solucao.find((x) => x.nome === nome);
        if (alvo) alvo.codigo = s.codigo; else solucao.push({ nome, codigo: s.codigo });
      });
      const cx = {
        stdin: a["data-stdin"] !== undefined ? Sim.textoEntrada(a["data-stdin"]) : null,
        args: Sim.dividirArgs(a["data-args"] || ""),
      };
      const chave = crypto.createHash("sha1").update(JSON.stringify([cx, meta, abas, solucao])).digest("hex");
      if (!semCache && cache[chave]) {
        novoCache[chave] = cache[chave]; nCache++;
        if (meta) nMissoes++; else nLivres++;
        if (cache[chave].aviso) { nAvisos++; saidaPag.push("  ! " + rot + "\n      " + cache[chave].aviso); }
        continue;
      }
      const exec = (arqs) => C.executar(arqs, { args: cx.args, stdin: cx.stdin });
      const src = (arqs) => arqs.map((x) => x.codigo).join("\n");
      const ctx = (r, arqs) => ({ compilou: r.compilou, diag: r.diagTexto, out: r.compilou ? r.saida : null, exit: r.compilou ? r.exit : null, src: src(arqs) });
      let linha = "";
      const notaExec = (r) => {
        if (r.tempoEsgotado) avisos.push("passou de " + C.TEMPO_MAX / 1000 + " s rodando (laço infinito?): o editor para o programa");
        if (r.estourou) avisos.push("escreve mais de 2 MB (o editor interrompe)");
        if (r.falha) avisos.push("falha interna do motor: " + String(r.falha).split("\n")[0]);
      };
      try {
        if (meta) {
          nMissoes++;
          const ini = await exec(abas);
          const fIni = Sim.checarMeta(meta, ctx(ini, abas));
          const sol = await exec(solucao);
          const fSol = Sim.checarMeta(meta, ctx(sol, solucao));
          const erros = [];
          if (!fIni.length) erros.push("o código inicial JÁ cumpre a meta (a missão começa resolvida)");
          if (fSol.length) erros.push("a solução NÃO cumpre: " + fSol.join(" | "));
          if (sol.leuSemEntrada) avisos.push("a solução lê a entrada (Console.ReadLine) mas a caixa não tem data-stdin: no navegador o leitor digita; aqui recebeu fim da entrada (null)");
          notaExec(sol);
          if (erros.length) {
            nFalhas++; falhasPag++;
            linha = "  ✗ " + rot + "\n" + erros.map((e) => "      " + e).join("\n") + "\n      solução:\n" + mostrarExec(sol);
            if (!fIni.length) linha += "\n      código inicial:\n" + mostrarExec(ini);
          } else {
            linha = verboso ? "  ✓ " + rot + " (compilou em " + sol.msCompilacao + " ms)\n" + mostrarExec(sol) : "";
            novoCache[chave] = { ok: true, aviso: avisos.join("; ") || undefined };
          }
          if (nativo) { const d = comparar(Lab, cx, solucao, sol, meta); if (d.dif) nDifNativo++; if (d.falhaMeta) { nFalhas++; falhasPag++; } linha = (linha || (d.falhaMeta ? "  ✗ " : "  · ") + rot) + d.txt; }
        } else {
          nLivres++;
          const r = await exec(abas);
          if (!r.compilou) avisos.push("não compila (se for de propósito, ignore): " + (Sim.diagnosticos(r.diagTexto).erros[0] || r.diagTexto.split("\n")[0] || "").slice(0, 200));
          if (r.leuSemEntrada) avisos.push("lê a entrada (Console.ReadLine) sem data-stdin: no navegador o leitor digita");
          notaExec(r);
          linha = verboso ? "  · " + rot + " (compilou em " + r.msCompilacao + " ms)\n" + mostrarExec(r) : "";
          novoCache[chave] = { ok: true, aviso: avisos.join("; ") || undefined };
          if (nativo) { const d = comparar(Lab, cx, abas, r, null); if (d.dif) nDifNativo++; linha = (linha || "  · " + rot) + d.txt; }
        }
      } catch (e) {
        nFalhas++; falhasPag++;
        linha = "  ✗ " + rot + "\n      erro ao rodar: " + ((e && e.message) || e);
      }
      if (avisos.length) { nAvisos++; linha = (linha || "") + (linha ? "\n" : "") + "  ! " + rot + "\n" + avisos.map((x) => "      " + x).join("\n"); }
      if (linha) saidaPag.push(linha);
    }
    console.log((falhasPag ? "✗ " : saidaPag.some((l) => /^\s*! /m.test(l)) ? "! " : "✓ ") + path.basename(arq) + " — " + lista.length + " caixa" + (lista.length !== 1 ? "s" : ""));
    saidaPag.forEach((l) => console.log(l));
  }
  try { const tmp = CACHE + "." + process.pid; fs.writeFileSync(tmp, JSON.stringify({ versao: versaoMotor, itens: Object.assign({}, nativo || verboso ? cache : {}, novoCache) })); fs.renameSync(tmp, CACHE); } catch (e) { /* ok */ }
  C.encerrar();
  console.log("\n" + nMissoes + " missões, " + nLivres + " caixas livres" + (nCache ? " (" + nCache + " do cache)" : "") + " — " + (nFalhas ? nFalhas + " com problema" : "tudo certo") + (nAvisos ? ", " + nAvisos + " aviso(s)" : "") +
    (nativo ? ", " + nDifNativo + " com diferença no laboratório" : "") + ". Roslyn " + (man ? man.roslyn + " + .NET " + man.runtime + " (WebAssembly), motor " + man.versao : "?") + ".");
  process.exit(nFalhas ? 1 : 0);
}

// Compara com o dotnet do laboratório. Diferença não conta como falha; meta não cumprida no laboratório, conta.
function comparar(Lab, cx, arquivos, r, meta) {
  try {
    const n = Lab.rodar(arquivos, { args: cx.args, stdin: cx.stdin });
    const partes = [];
    const fonte = arquivos.map((x) => x.codigo).join("\n");
    if (n.compilou !== r.compilou) partes.push("no laboratório " + (n.compilou ? "COMPILA" : "NÃO compila") + " (no editor " + (r.compilou ? "compila" : "não compila") + ")" + (n.compilou ? "" : ":\n" + trecho(n.diag, 8)));
    const dd = Lab.diferencas(String(r.diagTexto || "").replace(/\s+$/, ""), String(n.diag || "").replace(/\s+$/, ""));
    if (dd.length) partes.push("mensagens do compilador (- editor, + lab)\n" + dd.slice(0, 10).map((l) => "        " + l).join("\n"));
    if (n.compilou && r.compilou) {
      if (n.exit !== r.exit) partes.push("código de saída: lab " + n.exit + " × editor " + r.exit);
      const d = Lab.diferencas(r.saida, n.saida);
      if (d.length) {
        const lib = Lab.classificar(d.concat(dd), fonte);
        partes.push(d.length + " linha(s) de saída diferente(s)" + (lib.length ? " — esperado: " + lib.join("; ") : "") + "\n" + d.slice(0, 12).map((l) => "        " + l).join("\n"));
      }
    }
    let falhaMeta = false;
    if (meta) {
      const f = Sim.checarMeta(meta, { compilou: n.compilou, diag: n.diag, out: n.compilou ? n.saida : null, exit: n.compilou ? n.exit : null, src: fonte });
      if (f.length) { falhaMeta = true; partes.push("no laboratório a meta NÃO é cumprida: " + f.join(" | ")); }
    }
    if (!partes.length) return { dif: false, txt: "\n      nativo (dotnet " + n.versao + "): igual" };
    return { dif: true, falhaMeta, txt: "\n      nativo (dotnet " + n.versao + "):\n" + partes.map((p) => "      · " + p).join("\n") };
  } catch (e) { return { dif: false, txt: "\n      nativo: não consegui rodar (" + e.message + ")" }; }
}

main().catch((e) => { console.error(e); process.exit(2); });
