/* =====================================================================
   csharpsim.js — o "Experimente" do Guia C#, com o compilador C# DE VERDADE.
   O Roslyn (o compilador do `dotnet`, o mesmo do laboratório: SDK 10.0.112, C# 14) e o runtime
   .NET 10 em WebAssembly ficam em assets/cs/ e só são baixados no primeiro clique em "Rodar"
   (guardados na Cache API do navegador). Rodam em Web Workers (assets/cs/cs-worker.js):
   um worker compila; cada programa roda num worker novo (um laço infinito não trava a página:
   "Parar" encerra o worker).

   Monta as caixas  <div class="trycs" data-goal="…" data-stdin="…" data-args="…" data-file="…">
   (contrato: CONTRIBUINDO.md, seções 3 e 4).
   Também roda no Node (tools/testar-missoes.js usa as funções puras daqui).
   ===================================================================== */
(function () {
  "use strict";
  var CS_BYTES = 14077078;   // download na 1ª vez (atualizado por tools/construir-cs.sh)
  var TEMPO_MAX = 15000;     // ms rodando sem parar (sem contar a espera por entrada)
  var MAX_LINHAS = 3000;     // linhas mostradas no terminal (o resto é resumido)
  var CSharpSim = {};

  /* =====================================================================
     1. Funções puras (navegador e Node)
     ===================================================================== */
  function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  CSharpSim.escHtml = escHtml;

  var ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", bull: "•", middot: "·", deg: "°", times: "×", divide: "÷", euro: "€", pound: "£", cent: "¢", sect: "§", para: "¶", ordf: "ª", ordm: "º", larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔", rArr: "⇒", check: "✓", aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í", Iacute: "Í", oacute: "ó", Oacute: "Ó", uacute: "ú", Uacute: "Ú", atilde: "ã", Atilde: "Ã", otilde: "õ", Otilde: "Õ", ccedil: "ç", Ccedil: "Ç", acirc: "â", Acirc: "Â", ecirc: "ê", Ecirc: "Ê", ocirc: "ô", Ocirc: "Ô", agrave: "à", Agrave: "À", uuml: "ü", Uuml: "Ü", ntilde: "ñ", Ntilde: "Ñ", le: "≤", ge: "≥", ne: "≠", shy: "\u00ad", zwj: "\u200d", thinsp: "\u2009", ensp: "\u2002", emsp: "\u2003" };
  function decodificarEntidades(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, function (t, n) {
      if (n.charAt(0) === "#") {
        var c = n.charAt(1).toLowerCase() === "x" ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10);
        try { return String.fromCodePoint(c); } catch (e) { return t; }
      }
      return Object.prototype.hasOwnProperty.call(ENTIDADES, n) ? ENTIDADES[n] : t;
    });
  }
  CSharpSim.decodificarEntidades = decodificarEntidades;

  function semAnsi(s) { return String(s || "").replace(/\x1b\[[0-9;]*m/g, ""); }
  CSharpSim.semAnsi = semAnsi;

  // Linhas de diagnóstico do dotnet: "/home/ana/cs/ola.cs(3,5): error CS0103: … [projeto.csproj]"
  var RE_DIAG = /^(?:.*?\(\d+,\d+(?:,\d+,\d+)?\): |CSC : )?(error|warning) ([A-Z]+\d+): (.*)$/;
  function diagnosticos(diag) {
    var r = { erros: [], avisos: [] };
    semAnsi(diag).split("\n").forEach(function (l) {
      var m = RE_DIAG.exec(l);
      if (!m) return;
      if (m[1] === "warning") r.avisos.push(l); else r.erros.push(l);
    });
    return r;
  }
  CSharpSim.diagnosticos = diagnosticos;

  /* Metas (data-goal), separadas por vírgula. Escapes: "\," = vírgula literal,
     "\\" = uma barra invertida literal (qualquer outro "\x" fica como está,
     então "\d", "\s" etc. das regex não mudam). Uma vírgula sem escape só
     separa metas se o que vem depois for o nome de uma meta. */
  var META_TIPOS = /^(out|outre|compila|erro|aviso|semaviso|exit|src)(:|\s*$|\s*,)/;
  CSharpSim.META_NOMES = ["out", "outre", "compila", "erro", "aviso", "semaviso", "exit", "src"];
  function dividirMetas(meta) {
    var r = [], cur = "";
    meta = String(meta || "");
    for (var i = 0; i < meta.length; i++) {
      var c = meta[i];
      if (c === "\\" && (meta[i + 1] === "," || meta[i + 1] === "\\")) { cur += meta[i + 1]; i++; continue; }
      if (c === "," && META_TIPOS.test(meta.slice(i + 1).replace(/^\s+/, ""))) { r.push(cur); cur = ""; continue; }
      cur += c;
    }
    r.push(cur);
    return r.map(function (x) { return x.replace(/^\s+/, ""); }).filter(Boolean);
  }
  CSharpSim.dividirMetas = dividirMetas;

  // "/regex/flags" → RegExp; senão null (é texto)
  function regexDe(v) {
    var m = /^\/([\s\S]*)\/([gimsuy]*)$/.exec(v);
    if (!m) return null;
    return new RegExp(m[1], m[2].replace("g", ""));
  }
  CSharpSim.regexDe = regexDe;
  function confere(v, txt) {
    var re = regexDe(v);
    return re ? re.test(txt) : txt.indexOf(v) >= 0;
  }

  /* ctx: { compilou: bool, diag: texto do compilador,
            out: saída do PROGRAMA (stdout+stderr, na ordem; nunca o compilador),
            exit: código de saída do programa (null se não rodou), src: código do leitor (todas as abas) } */
  function checarMeta(meta, ctx) {
    var falhas = [];
    var d = null;
    function diags() { if (!d) d = diagnosticos(ctx.diag); return d; }
    var diagTxt = semAnsi(ctx.diag);
    dividirMetas(meta).forEach(function (g) {
      var i = g.indexOf(":"), tipo = (i < 0 ? g : g.slice(0, i)).trim(), val = i < 0 ? "" : g.slice(i + 1), ok = false;
      try {
        switch (tipo) {
          case "out": ok = !!ctx.compilou && ctx.out !== null && ctx.out !== undefined && String(ctx.out).indexOf(val) >= 0; break;
          case "outre": ok = !!ctx.compilou && ctx.out !== null && ctx.out !== undefined && new RegExp(val).test(ctx.out); break;
          case "compila": ok = !!ctx.compilou; break;
          case "erro": ok = !ctx.compilou && confere(val, diagTxt); break;
          case "aviso": ok = diags().avisos.some(function (l) { return confere(val, l); }); break;
          case "semaviso": ok = !!ctx.compilou && diags().avisos.length === 0; break;
          case "exit": ok = !!ctx.compilou && ctx.exit !== null && ctx.exit !== undefined && String(ctx.exit) === val.trim(); break;
          case "src": ok = new RegExp(val, "m").test(ctx.src || ""); break;
          default: ok = false;
        }
      } catch (e) { ok = false; }
      if (!ok) falhas.push(g);
    });
    return falhas;
  }
  CSharpSim.checarMeta = checarMeta;

  function decodificarAttr(s) { return String(s).replace(/\\n/g, "\n").replace(/\\t/g, "\t"); }
  CSharpSim.decodificarAttr = decodificarAttr;
  // data-stdin → texto entregue ao programa (termina com Enter, como quem digita)
  function textoEntrada(s) { s = decodificarAttr(s); return s === "" || /\n$/.test(s) ? s : s + "\n"; }
  CSharpSim.textoEntrada = textoEntrada;
  // "a 'b c' \"d\"" → ["a", "b c", "d"] (como o bash separa os argumentos)
  function dividirArgs(s) {
    var r = [], cur = null, i = 0;
    s = String(s || "");
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { if (cur !== null) { r.push(cur); cur = null; } i++; continue; }
      if (cur === null) cur = "";
      if (c === "'") { var f = s.indexOf("'", i + 1); if (f < 0) f = s.length; cur += s.slice(i + 1, f); i = f + 1; continue; }
      if (c === '"') { i++; while (i < s.length && s[i] !== '"') { if (s[i] === "\\" && /["\\$`]/.test(s[i + 1] || "")) i++; cur += s[i]; i++; } i++; continue; }
      if (c === "\\" && i + 1 < s.length) { cur += s[i + 1]; i += 2; continue; }
      cur += c; i++;
    }
    if (cur !== null) r.push(cur);
    return r;
  }
  CSharpSim.dividirArgs = dividirArgs;
  function citarArg(x) { return /^[\w@%+=:,.\/-]+$/.test(x) ? x : "'" + String(x).replace(/'/g, "'\\''") + "'"; }
  CSharpSim.citarArg = citarArg;
  function ehFonte(nome) { return /\.cs$/i.test(nome); }
  CSharpSim.ehFonte = ehFonte;
  // Onde o programa "mora", como no laboratório: um arquivo .cs → ~/cs e `dotnet run arquivo.cs`;
  // vários .cs (abas) → um projeto ~/projetos/Exemplo e `dotnet run`.
  function onde(arquivos) {
    var fontes = arquivos.filter(function (a) { return ehFonte(a.nome); });
    var principal = (fontes[0] || arquivos[0] || { nome: "Program.cs" }).nome;
    if (fontes.length > 1) return { projeto: "Exemplo", pasta: "/home/ana/projetos/Exemplo", til: "~/projetos/Exemplo", nome: "Exemplo", comando: "dotnet run" };
    return { projeto: null, pasta: "/home/ana/cs", til: "~/cs", nome: principal.replace(/^.*\//, "").replace(/\.[^.]*$/, "") || "Program", comando: "dotnet run " + principal };
  }
  CSharpSim.onde = onde;
  function linhaComando(arquivos, args) {
    return onde(arquivos).comando + (args && args.length ? " " + args.map(citarArg).join(" ") : "");
  }
  CSharpSim.linhaComando = linhaComando;

  if (typeof module === "object" && module.exports) { module.exports = CSharpSim; }
  if (typeof document === "undefined") return;
  window.CSharpSim = CSharpSim;

  /* =====================================================================
     2. Os workers: um compilador (fica vivo) e um executor novo por programa
     ===================================================================== */
  var base = (function () {
    if (window.CS_BASE) return window.CS_BASE;
    var s = document.querySelectorAll("script[src]");
    for (var i = 0; i < s.length; i++) { var src = s[i].getAttribute("src"); if (/csharpsim\.js(\?|$)/.test(src)) return src.replace(/csharpsim\.js.*$/, ""); }
    return "assets/";
  })();
  var manifesto = null, compilador = null, pronto = null, carregado = false, aoProgresso = [], ouvintes = {}, seq = 0;
  var reserva = null; // executor já carregado, esperando o próximo programa
  var dono = null;    // caixa que está rodando um programa

  function mb(bytes) { return Math.round(bytes / 1e6).toString(); }
  CSharpSim.tamanhoDownload = function () { return mb(CS_BYTES) + " MB"; };

  function novoWorker() { return new Worker(base + "cs/cs-worker.js", { type: "module" }); }
  function lerManifesto() {
    if (manifesto) return Promise.resolve(manifesto);
    return fetch(base + "cs/manifesto.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("manifesto.json: HTTP " + r.status); return r.json(); }).then(function (m) { manifesto = m; return m; });
  }
  function msgCarregar(papel) {
    var t = {}; Object.keys(manifesto.arquivos).forEach(function (k) { t[k] = manifesto.arquivos[k].bytes; });
    return { op: "carregar", papel: papel, versao: manifesto.versao, tamanhos: t };
  }

  function carregarCompilador(progresso) {
    if (progresso) aoProgresso.push(progresso);
    if (pronto) return pronto;
    pronto = lerManifesto().then(function () {
      return new Promise(function (ok, falha) {
        var w;
        try { w = novoWorker(); } catch (e) { falha(e); return; }
        compilador = w;
        w.onmessage = function (e) {
          var m = e.data;
          if (m.ev === "progresso") { aoProgresso.forEach(function (f) { try { f(m.lidos, m.total); } catch (x) {} }); return; }
          if (m.ev === "preparando") { aoProgresso.forEach(function (f) { try { f(-1, 0); } catch (x) {} }); return; }
          if (m.ev === "pronto") { carregado = true; aoProgresso = []; ok(); prepararReserva(); return; }
          if (m.ev === "falha" && !m.id) { aoProgresso = []; falha(new Error(m.msg)); return; }
          var f = ouvintes[m.id];
          if (f) { delete ouvintes[m.id]; f(m); }
        };
        w.onerror = function (e) { var msg = (e && e.message) || "o worker do compilador falhou"; if (!carregado) falha(new Error(msg)); console.error("csharpsim:", msg); };
        w.postMessage(msgCarregar("compilador"));
      });
    });
    pronto.catch(function () { pronto = null; carregado = false; if (compilador) { compilador.terminate(); compilador = null; } });
    return pronto;
  }
  function compilar(msg) {
    return new Promise(function (ok, falha) {
      var id = ++seq; msg.op = "compilar"; msg.id = id;
      ouvintes[id] = function (m) { if (m.ev === "compilado") ok(m); else falha(new Error(m.msg || "o compilador falhou")); };
      compilador.postMessage(msg);
    });
  }
  // executor: um runtime novo por programa (o anterior é descartado: estado limpo, Environment.Exit, laço infinito)
  function prepararReserva() {
    if (reserva || !manifesto) return;
    var w = novoWorker(), r = { w: w, pronto: false, fila: [] };
    r.promessa = new Promise(function (ok, falha) {
      w.onmessage = function (e) {
        var m = e.data;
        if (m.ev === "pronto") { r.pronto = true; ok(r); return; }
        if (m.ev === "progresso" || m.ev === "preparando") return;
        if (m.ev === "falha" && !r.ouvinte) { falha(new Error(m.msg)); return; }
        if (r.ouvinte) r.ouvinte(m);
      };
      w.onerror = function (e) { if (!r.pronto) falha(new Error((e && e.message) || "o executor falhou")); };
    });
    r.promessa.catch(function () { if (reserva === r) reserva = null; w.terminate(); });
    w.postMessage(msgCarregar("executor"));
    reserva = r;
  }
  function pegarExecutor() {
    prepararReserva();
    var r = reserva; reserva = null;
    return r.promessa;
  }

  /* =====================================================================
     3. Interface
     ===================================================================== */
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined && html !== null) e.innerHTML = html;
    return e;
  }
  function lerPre(pre) { return pre.textContent.replace(/^\n/, "").replace(/\n$/, ""); }

  function montar(box) {
    if (box.getAttribute("data-montado")) return;
    box.setAttribute("data-montado", "1");
    var meta = box.getAttribute("data-goal") || "";
    var stdinAttr = box.getAttribute("data-stdin");
    var argsIni = box.getAttribute("data-args") || "";
    var padrao = box.getAttribute("data-file") || "Program.cs";
    var scripts = Array.prototype.slice.call(box.querySelectorAll("pre.script"));
    var sols = Array.prototype.slice.call(box.querySelectorAll("pre.solucao"));
    var abas = scripts.map(function (p, i) { return { nome: p.getAttribute("data-file") || (i === 0 ? padrao : "Arquivo" + i + ".cs"), original: lerPre(p), atual: lerPre(p) }; });
    if (!abas.length) abas.push({ nome: padrao, original: "", atual: "" });
    var solucao = sols.length ? sols.map(function (p, i) { return { nome: p.getAttribute("data-file") || (abas[i] ? abas[i].nome : padrao), codigo: lerPre(p) }; }) : null;
    scripts.concat(sols).forEach(function (p) { p.style.display = "none"; });
    var ativa = 0;

    var w = el("div", { "class": "ts tc tcs" });
    var entradaHtml = stdinAttr !== null
      ? '<label class="tc-entrada-l">Entrada: <textarea class="tc-entrada" rows="' + Math.min(4, Math.max(1, textoEntrada(stdinAttr).replace(/\n$/, "").split("\n").length)) + '" spellcheck="false" autocomplete="off" autocapitalize="off" title="O que o programa vai ler com Console.ReadLine(), uma linha por Enter"></textarea></label>' : "";
    w.innerHTML =
      '<div class="ts-bar"><span class="tc-tabs"></span><span class="ts-sp"></span>' +
      (solucao ? '<button type="button" class="sim-btn ts-sol">Ver solução</button>' : "") +
      '<button type="button" class="sim-btn ts-rest" title="Volta ao código original">Restaurar</button></div>' +
      '<div class="ts-confirma" hidden><span>Trocar o seu código pela solução?</span> <button type="button" class="sim-btn2 ts-sim">Sim, mostrar</button> <button type="button" class="sim-btn2 secundario ts-nao">Cancelar</button></div>' +
      '<div class="ts-editor"><pre class="ts-nums" aria-hidden="true"></pre><textarea class="ts-code" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="Código C#"></textarea></div>' +
      '<div class="ts-run">' +
      '<label class="ts-args-l">Argumentos: <input class="ts-args" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="(nenhum)"></label>' + entradaHtml +
      '<button type="button" class="ts-rodar">▶ Rodar</button></div>' +
      '<div class="tc-carga" hidden><span class="tc-carga-txt"></span><span class="tc-barra"><i></i></span></div>' +
      '<div class="sim ts-saida" hidden><div class="sim-bar"><span class="sim-dots"><i></i><i></i><i></i></span><span class="sim-title">Terminal — ana@notebook: ~/cs</span></div><div class="sim-screen ts-tela"><div class="sim-out"></div></div></div>' +
      '<p class="tc-nota">O editor compila com o <strong>Roslyn</strong> (o compilador do <code>dotnet</code>) e roda o programa no <strong>.NET 10 em WebAssembly</strong>, aqui no navegador. <a href="simulador.html">Saiba mais</a>.</p>';
    box.appendChild(w);
    var status = null;
    if (meta) { status = el("p", { "class": "sim-status", "aria-live": "polite" }, "Missão em andamento…"); box.appendChild(status); }

    var ta = w.querySelector(".ts-code"), nums = w.querySelector(".ts-nums"), btn = w.querySelector(".ts-rodar");
    var carga = w.querySelector(".tc-carga"), cargaTxt = w.querySelector(".tc-carga-txt"), barra = w.querySelector(".tc-barra i");
    var argsIn = w.querySelector(".ts-args"), entradaIn = w.querySelector(".tc-entrada");
    var saidaBox = w.querySelector(".ts-saida"), out = w.querySelector(".sim-out"), tela = w.querySelector(".ts-tela"), titulo = w.querySelector(".sim-title");
    argsIn.value = argsIni;
    if (entradaIn) entradaIn.value = textoEntrada(stdinAttr).replace(/\n$/, "");
    ta.value = abas[0].atual;
    var cumprida = false, sessao = null;

    /* ---------- editor ---------- */
    function ajustar() {
      var n = ta.value.split("\n").length, t = "";
      for (var i = 1; i <= n; i++) t += i + "\n";
      nums.textContent = t;
      ta.style.height = "auto";
      ta.style.height = Math.max(ta.scrollHeight, 60) + "px";
    }
    function salvarAba() { abas[ativa].atual = ta.value; }
    function desenharAbas() {
      var cont = w.querySelector(".tc-tabs");
      cont.innerHTML = abas.map(function (a, i) { return '<button type="button" class="tc-tab' + (i === ativa ? " on" : "") + '" data-i="' + i + '" aria-pressed="' + (i === ativa) + '">' + escHtml(a.nome) + "</button>"; }).join("");
      Array.prototype.forEach.call(cont.querySelectorAll(".tc-tab"), function (b) { b.addEventListener("click", function () { trocarAba(+b.getAttribute("data-i")); }); });
    }
    function trocarAba(i) { salvarAba(); ativa = i; ta.value = abas[i].atual; ajustar(); desenharAbas(); }
    desenharAbas();
    function inserir(txt, a, b) {
      if (ta.setRangeText) ta.setRangeText(txt, a, b, "end");
      else { ta.value = ta.value.slice(0, a) + txt + ta.value.slice(b); ta.selectionStart = ta.selectionEnd = a + txt.length; }
      salvarAba(); ajustar();
    }
    ta.addEventListener("input", function () { salvarAba(); ajustar(); });
    ta.addEventListener("keydown", function (e) {
      var a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
      if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        var ini = v.lastIndexOf("\n", a - 1) + 1;
        if (e.shiftKey) {
          var tira = /^ {1,4}|^\t/.exec(v.slice(ini));
          if (tira) { ta.value = v.slice(0, ini) + v.slice(ini + tira[0].length); ta.selectionStart = Math.max(ini, a - tira[0].length); ta.selectionEnd = Math.max(ini, b - tira[0].length); salvarAba(); ajustar(); }
        } else if (a !== b && v.slice(a, b).indexOf("\n") >= 0) {
          var bloco = v.slice(ini, b).replace(/^/gm, "    ");
          ta.value = v.slice(0, ini) + bloco + v.slice(b); ta.selectionStart = ini; ta.selectionEnd = ini + bloco.length; salvarAba(); ajustar();
        } else inserir("    ", a, b);
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); rodar(); }
      else if (e.key === "Enter" && !e.shiftKey) {
        var ini2 = v.lastIndexOf("\n", a - 1) + 1, antes = v.slice(ini2, a), ind = /^[ \t]*/.exec(antes)[0];
        if (/[{(\[]\s*$/.test(antes) && !/^\s*(\/\/|\*)/.test(antes)) ind += "    ";
        if (ind) { e.preventDefault(); inserir("\n" + ind, a, b); }
      } else if (e.key === "}" && a === b && /^[ \t]+$/.test(v.slice(v.lastIndexOf("\n", a - 1) + 1, a))) {
        var ini3 = v.lastIndexOf("\n", a - 1) + 1, esp = v.slice(ini3, a);
        if (esp.length >= 4) { e.preventDefault(); ta.value = v.slice(0, a - 4) + "}" + v.slice(b); ta.selectionStart = ta.selectionEnd = a - 3; salvarAba(); ajustar(); }
      } else if (e.key === "Escape") { ta.blur(); }
    });
    w.querySelector(".ts-rest").addEventListener("click", function () { abas.forEach(function (a) { a.atual = a.original; }); abas = abas.filter(function (a) { return !a.extra; }); ativa = Math.min(ativa, abas.length - 1); ta.value = abas[ativa].atual; ajustar(); desenharAbas(); });
    var conf = w.querySelector(".ts-confirma");
    if (solucao) {
      w.querySelector(".ts-sol").addEventListener("click", function () { conf.hidden = false; });
      w.querySelector(".ts-sim").addEventListener("click", function () {
        solucao.forEach(function (sl) {
          var a = abas.filter(function (x) { return x.nome === sl.nome; })[0];
          if (a) a.atual = sl.codigo; else abas.push({ nome: sl.nome, original: "", atual: sl.codigo, extra: true });
        });
        ta.value = abas[ativa].atual; ajustar(); desenharAbas(); conf.hidden = true;
      });
      w.querySelector(".ts-nao").addEventListener("click", function () { conf.hidden = true; });
    }
    ajustar();

    // aba de dados (.txt, .csv…): termina com Enter, como um arquivo de verdade (o <pre> perde o último \n no lerPre)
    function comEnter(a) { return !ehFonte(a.nome) && a.atual !== "" && a.atual.slice(-1) !== "\n" ? a.atual + "\n" : a.atual; }
    function arquivos() { salvarAba(); return abas.map(function (a) { return { nome: a.nome, codigo: comEnter(a) }; }); }
    function fonte() { return abas.map(function (a) { return a.atual; }).join("\n"); }
    function verificar(ctx) {
      if (!status || cumprida) return;
      ctx.src = fonte();
      var f = checarMeta(meta, ctx);
      if (!f.length) { cumprida = true; status.textContent = "✔ Missão cumprida!"; status.className = "sim-status ok"; return; }
      var tipos = f.map(function (x) { return x.split(":")[0].trim(); });
      if (tipos.every(function (t) { return t === "src" || t === "exit"; })) status.textContent = "Missão em andamento… (ainda falta: " + f.join(", ") + ")";
      else if (tipos.indexOf("compila") >= 0 || (!ctx.compilou && tipos.some(function (t) { return t === "semaviso" || t === "out" || t === "outre" || t === "exit"; }))) status.textContent = "Missão em andamento… (o código ainda não compila)";
      else if (tipos.indexOf("semaviso") >= 0) status.textContent = "Missão em andamento… (o compilador ainda dá avisos)";
      else if (tipos.indexOf("erro") >= 0) status.textContent = "Missão em andamento… (a missão pede um erro de compilação" + (ctx.compilou ? "; o código ainda compila)" : " diferente)");
      else if (tipos.indexOf("aviso") >= 0) status.textContent = "Missão em andamento… (a missão pede um aviso do compilador)";
      else status.textContent = "Missão em andamento… (a saída ainda não é a esperada)";
    }

    /* ---------- carregamento (só na primeira vez) ---------- */
    function garantirCompilador() {
      if (pronto && carregado) return pronto;
      carga.hidden = false;
      var txt0 = "Baixando o compilador C# e o .NET (≈ " + mb(CS_BYTES) + " MB, só na primeira vez)…";
      cargaTxt.textContent = txt0;
      barra.style.width = "0%";
      var p = carregarCompilador(function (lidos, total) {
        if (lidos < 0) { barra.style.width = "100%"; cargaTxt.textContent = "Preparando o compilador…"; return; }
        var pct = Math.min(100, Math.round(lidos * 100 / (total || CS_BYTES)));
        barra.style.width = pct + "%";
        cargaTxt.textContent = pct >= 100 ? "Preparando o compilador…" : txt0 + " " + pct + "%";
      });
      return p.then(function () { carga.hidden = true; }, function (e) {
        carga.hidden = false; barra.style.width = "0%";
        cargaTxt.textContent = "Não consegui carregar o compilador: " + ((e && e.message) || e) + " Confira a internet e clique em Rodar de novo.";
        throw e;
      });
    }

    /* ---------- terminal ---------- */
    function prompt(dir) { return '<span class="c-u">ana@notebook</span>:<span class="c-d">' + escHtml(dir) + "</span>$ "; }
    function linhaCmd(dir, cmd) { out.appendChild(el("div", { "class": "sim-cmd" }, prompt(dir) + escHtml(cmd))); rolar(); }
    function info(txt, cls) { var d = el("div", { "class": cls || "sim-info" }); d.textContent = txt; out.appendChild(d); rolar(); return d; }
    function rolar() { tela.scrollTop = tela.scrollHeight; }

    // Texto chega em pedaços; segmentos {t: "out"|"err"|"eco", s}
    function Terminal(raiz) { this.raiz = raiz; this.linha = null; this.segs = []; this.n = 0; this.omitidas = 0; this.cauda = []; }
    Terminal.prototype.escrever = function (t, s) {
      var partes = s.split("\n");
      for (var i = 0; i < partes.length; i++) {
        if (partes[i]) this.seg(t, partes[i]);
        if (i < partes.length - 1) this.fechar();
      }
    };
    Terminal.prototype.seg = function (t, s) {
      var u = this.segs[this.segs.length - 1];
      if (u && u.t === t) u.s += s; else this.segs.push({ t: t, s: s });
      this.desenhar();
    };
    Terminal.prototype.html = function (segs) {
      return segs.map(function (x) {
        if (x.t === "eco") return '<span class="sim-digitado">' + escHtml(x.s) + "</span>";
        return x.t === "err" ? '<span class="sim-err">' + escHtml(x.s) + "</span>" : escHtml(x.s);
      }).join("");
    };
    Terminal.prototype.desenhar = function () {
      if (this.n >= MAX_LINHAS) return;
      if (!this.linha) { this.linha = el("div"); this.raiz.appendChild(this.linha); }
      var campo = this.linha.querySelector(".ts-campo");
      this.linha.innerHTML = this.html(this.segs);
      if (campo) this.linha.appendChild(campo);
    };
    Terminal.prototype.fechar = function () {
      if (this.n < MAX_LINHAS) { this.desenhar(); if (this.linha && !this.linha.innerHTML) this.linha.innerHTML = "<br>"; }
      else { this.omitidas++; this.cauda.push(this.segs); if (this.cauda.length > 40) this.cauda.shift(); }
      this.n++; this.linha = null; this.segs = [];
    };
    Terminal.prototype.terminar = function () {
      if (this.segs.length) this.fechar();
      if (this.omitidas) {
        var pulo = this.omitidas - this.cauda.length, self = this;
        if (pulo > 0) info("(… mais " + pulo.toLocaleString("pt-BR") + " linhas — o editor mostra só o começo e o fim …)");
        this.cauda.forEach(function (c) { self.raiz.appendChild(el("div", null, self.html(c) || "<br>")); });
      }
    };
    Terminal.prototype.linhaAtual = function () {
      if (!this.linha) { this.linha = el("div"); this.raiz.appendChild(this.linha); this.desenhar(); }
      return this.linha;
    };

    function parar(motivo) {
      if (!sessao) return;
      var s = sessao;
      s.motivo = motivo || "^C";
      if (s.exec) { s.exec.w.terminate(); s.exec = null; }
      finalizar(s, null, s.motivo);
    }

    function finalizar(s, exit, motivo) {
      if (s.fim) return;
      s.fim = true;
      clearInterval(s.relogio);
      if (s.exec) { s.exec.w.terminate(); s.exec = null; }
      if (s.campo && s.campo.parentNode) s.campo.parentNode.removeChild(s.campo);
      if (s.term) {
        if (motivo === "^C") s.term.escrever("eco", "^C");
        s.term.terminar();
      }
      if (motivo && motivo !== "^C") info(motivo, "sim-info");
      var codigo = exit === null || exit === undefined ? (motivo === "^C" ? 130 : null) : exit;
      if (s.compilou === false) codigo = 1;
      out.appendChild(el("div", { "class": "ts-codigo" + (codigo ? " ts-erro" : "") }, codigo === null || codigo === undefined ? "[programa interrompido]" : "[código de saída: " + codigo + "]"));
      rolar();
      sessao = null; if (dono === parar) dono = null;
      btn.textContent = "▶ Rodar"; btn.disabled = false;
      if (s.compilou === false) verificar({ compilou: false, diag: s.diag, out: null, exit: null });
      else if (exit !== null && exit !== undefined) verificar({ compilou: true, diag: s.diag, out: s.texto, exit: exit });
      prepararReserva();
    }

    function pedirEntrada(s) {
      if (s.campo) return;
      var campo = el("input", { "class": "ts-campo", type: "text", spellcheck: "false", autocomplete: "off", autocapitalize: "off", "aria-label": "Entrada do programa (Enter envia, Ctrl+D encerra a entrada)" });
      s.term.linhaAtual().appendChild(campo);
      s.campo = campo; s.esperando = true;
      campo.focus({ preventScroll: true });
      rolar();
      function sair() { if (campo.parentNode) campo.parentNode.removeChild(campo); s.campo = null; s.esperando = false; }
      campo.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); var v = campo.value; sair(); s.entradas.push(v + "\n"); executar(s); }
        else if (e.ctrlKey && (e.key === "d" || e.key === "D")) { e.preventDefault(); sair(); s.entradas.push(""); executar(s); }
        else if (e.ctrlKey && (e.key === "c" || e.key === "C") && campo.selectionStart === campo.selectionEnd) { e.preventDefault(); parar(); }
      });
    }

    // roda o programa compilado (de novo, com as linhas já digitadas, se ele pediu entrada: "repetição")
    function executar(s) {
      s.saidaArea.innerHTML = "";
      s.term = new Terminal(s.saidaArea);
      s.texto = "";
      s.gasto = 0;
      pegarExecutor().then(function (ex) {
        if (s.fim) { ex.w.terminate(); return; }
        s.exec = ex;
        prepararReserva();
        s.desde = Date.now();
        ex.ouvinte = function (m) {
          if (s.fim || s.exec !== ex) return;
          if (m.ev === "saida") {
            s.texto += m.s;
            if (s.texto.length > 2e6) { parar("(o programa escreveu mais de 2 MB; o editor o interrompeu)"); return; }
            s.term.escrever(m.fd === 2 ? "err" : "out", m.s); rolar();
          } else if (m.ev === "eco") { s.term.escrever("eco", m.s); rolar(); }
          else if (m.ev === "espera") { s.esperandoEntrada = true; }
          else if (m.ev === "fim") {
            ex.w.terminate(); s.exec = null;
            if (s.esperandoEntrada) { s.esperandoEntrada = false; s.gasto = 0; pedirEntrada(s); return; }
            finalizar(s, m.exit, null);
          } else if (m.ev === "falha") { finalizar(s, null, "(o .NET do navegador falhou: " + String(m.msg).split("\n")[0] + ")"); console.error("csharpsim:", m.msg); }
        };
        var dados = s.arqs.filter(function (a) { return !ehFonte(a.nome); });
        ex.w.postMessage({ op: "rodar", dll: s.dll, pdb: s.pdb, args: s.args, pasta: s.onde.pasta, nomes: dados.map(function (a) { return a.nome; }), conteudos: dados.map(function (a) { return a.codigo; }), stdin: s.stdin, entradas: s.entradas, interativo: s.stdin === null, semente: s.semente });
      }, function (e) { finalizar(s, null, "(não consegui iniciar o .NET: " + ((e && e.message) || e) + ")"); });
    }

    function rodar() {
      if (sessao) { parar(); return; }
      var arqs = arquivos();
      var o = onde(arqs);
      titulo.textContent = "Terminal — ana@notebook: " + o.til;
      saidaBox.hidden = false;
      out.innerHTML = "";
      var args = dividirArgs(argsIn.value);
      linhaCmd(o.til, linhaComando(arqs, args));
      var s = sessao = { arqs: arqs, onde: o, args: args, texto: "", diag: "", fim: false, entradas: [], semente: (Math.random() * 4294967296) >>> 0 };
      btn.textContent = "■ Parar"; btn.disabled = false;
      var compilando = info("(compilando…)", "sim-info tc-compilando");
      garantirCompilador().then(function () {
        if (sessao !== s) return;
        if (dono && dono !== parar) dono("(outro programa foi iniciado nesta página)");
        dono = parar;
        s.stdin = entradaIn ? textoEntrada(entradaIn.value) : null;
        return compilar({ arquivos: arqs.map(function (a) { return { nome: a.nome, codigo: a.codigo }; }), pasta: o.pasta, projeto: o.projeto, nome: o.nome }).then(function (m) {
          if (s.fim) return;
          if (compilando.parentNode) compilando.parentNode.removeChild(compilando);
          var r = m.r;
          s.diag = r.texto; s.compilou = r.ok;
          if (r.texto) r.texto.replace(/\n$/, "").split("\n").forEach(function (l) {
            var cls = /: error [A-Z]+\d+:/.test(l) ? "tc-diag tc-diag-erro" : /: warning [A-Z]+\d+:/.test(l) ? "tc-diag tc-diag-aviso" : "tc-diag";
            out.appendChild(el("div", { "class": cls }, escHtml(l) || "<br>"));
          });
          if (!r.ok) { finalizar(s, null, null); return; }
          s.dll = m.dll; s.pdb = m.pdb;
          s.saidaArea = el("div", { "class": "tcs-programa" });
          out.appendChild(s.saidaArea);
          s.relogio = setInterval(function () {
            if (s.esperando || s.fim || !s.exec) return;
            if (Date.now() - s.desde > TEMPO_MAX) parar("(o editor parou o programa: ele rodou mais de " + TEMPO_MAX / 1000 + " segundos sem terminar — laço infinito?)");
          }, 500);
          executar(s);
          rolar();
        });
      }).catch(function (e) {
        if (sessao !== s) return;
        if (compilando.parentNode) compilando.parentNode.removeChild(compilando);
        if (carregado) finalizar(s, null, "(o compilador do navegador falhou: " + ((e && e.message) || e) + ")");
        else { sessao = null; btn.textContent = "▶ Rodar"; btn.disabled = false; }
      });
    }
    btn.addEventListener("click", rodar);
  }

  function montarTudo() {
    Array.prototype.forEach.call(document.querySelectorAll(".trycs"), function (b) {
      try { montar(b); } catch (e) { console.error("csharpsim:", e); }
    });
  }
  CSharpSim.montarTudo = montarTudo;
  CSharpSim._estado = function () { return { carregado: carregado, compilador: !!compilador, reserva: !!reserva }; };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montarTudo); else montarTudo();
})();
