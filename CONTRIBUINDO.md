# Como escrever uma página do Guia C#

O guia é uma **escola**, estilo W3Schools, para quem **nunca programou**. **Uma aula = um assunto.** O dono do projeto já reclamou de outro guia que juntava vários assuntos numa página só. Nunca mostre código "seco":
- explique cada linha (anatomia);
- mostre a saída real;
- mostre o que acontece quando dá errado, com a mensagem real do compilador ou a exceção;
- deixe o leitor praticar no editor do guia, que **compila e roda C# de verdade** no navegador.

Antes de tudo, leia o `RECURSOS.md`: onde trabalhar (VPS) e como.

## 1. Esqueleto do arquivo
Use como modelo a estrutura de uma página do Guia C: o cabeçalho, o `<main>`, os blocos e o rodapé de `~/guia-c/variaveis.html`. Para a profundidade de POO, veja também `~/guia-java/` (Guia Java publicado). Troque:
- `<title>C# TEMA — descrição | Guia C#</title>`;
- `<h1>C# <span class="hl">TEMA</span></h1>`;
- a caixa `.tryc` por **`.trycs`**.

Menu, selo e Anterior/Próximo vêm de `assets/site.js` (`NIVEIS`). **Não mude a `NIVEIS`.** Links internos só para páginas que estão nela (mesmo que ainda não existam: outro autor está escrevendo).

## 2. Ordem de uma aula
1. Intro.
2. "Você vai aprender".
3. A ideia antes do código, com uma comparação do dia a dia.
4. Do simples ao completo, uma novidade por vez, com `dl.anatomy` ou uma tabela "linha → o que faz".
5. **Saída real** depois de cada exemplo.
6. **Pelo menos dois "Experimente"** (`.trycs`) por aula: um no meio e uma missão no fim.
7. Formas diferentes + "qual usar".
8. **Quando dá errado** (`div.cenario`): o código, a mensagem real (erro `CSxxxx` ou exceção), o que significa e como consertar.
9. Referência (`table.ref`).
10. Exercícios (3 ou mais: `.exercise`, `.mc`).
11. Resumo.

Páginas de **Projetos** seguem o passo a passo: versão 1, 2, 3… do programa, cada uma com um `.trycs`. Páginas de **Referência** são tabelas com poucos `.trycs` (pode ser um só). `quiz.html` usa só `.mc`.

## 3. Componentes

### Código para ler
```html
<pre class="file" data-file="ola.cs">Console.WriteLine("Olá, mundo!");
</pre>
```
Dentro de `<pre>`, escape `&lt; &gt; &amp;`: `List&lt;int&gt;`, `a &amp;&amp; b`, `x =&gt; x * 2`.

### Terminal (`pre.term`)
Igual aos outros guias:
- `$ ` = `ana@notebook:~$`;
- `> ` = continuação;
- `«` = anotação.

Use-o para `dotnet run`, `dotnet new`, `dotnet build`, `dotnet test` etc.

### Como a Ana roda C# (decidido; use sempre assim)
- **Níveis 1 e 2, arquivo único:** a Ana escreve `ola.cs` e roda **`dotnet run ola.cs`**. Isso é novo no .NET 10 ("file-based apps"): não precisa de projeto. As instruções de nível superior ficam direto no arquivo, sem `class Program`/`Main`.
  - `dotnet-run.html` ensina esse comando, e `projetos-console.html` ensina `dotnet new console` + `dotnet run`.
  - `top-level.html` mostra o `static void Main` e explica que os dois são o mesmo programa.
- **Vários arquivos, pacotes NuGet e Ferramentas:** projeto (`dotnet new console -o Nome`, `cd Nome`, `dotnet run`).
- A pasta de trabalho da Ana é `~/cs` para arquivos soltos e `~/projetos/Nome` para projetos.

### Editor "Experimente" (`.trycs`), com compilador real
```html
<div class="trycs" data-goal="out:Olá, Ana!">
<p class="try-task"><strong>Missão:</strong> troque "mundo" por "Ana" e clique em Rodar.</p>
<pre class="script">Console.WriteLine("Olá, mundo!");
</pre>
<pre class="solucao">Console.WriteLine("Olá, Ana!");
</pre>
</div>
```
- **Rodar** compila o código com o **compilador C# real** (Roslyn, o mesmo do `dotnet`) e roda o programa com o **.NET em WebAssembly**, dentro do navegador. A caixa mostra os erros e avisos (`CSxxxx`), a saída e o código de saída.
- `data-file="…"`: o nome do arquivo (padrão: `Program.cs`). **Vários arquivos:** vários `<pre class="script" data-file="…">` na mesma caixa, que viram abas. Todos os `.cs` são compilados juntos (como num projeto), e os outros arquivos (`.txt`, `.json`, `.csv`) ficam na pasta em que o programa roda.
- `data-stdin="…"`: a entrada para `Console.ReadLine()`. Sem `data-stdin`, o programa pode **pedir a entrada e o leitor digita** no terminal da caixa (o agente do simulador documenta como, na seção 4).
- `data-args="…"`: o que chega em `args`.
- Sem `data-goal`: caixa livre.
- Com `data-goal`: missão, e o `pre.solucao` é **obrigatório**. Com várias abas, use um `pre.solucao data-file="…"` para cada arquivo que muda.

### Metas (`data-goal`, separadas por vírgula; `\,` = vírgula literal)
| Meta | Verdade quando… |
| --- | --- |
| `out:TEXTO` / `outre:REGEX` | a saída do programa (stdout e stderr, como no terminal) contém / casa |
| `compila` | compilou sem erros |
| `erro:TEXTO` | a compilação **falhou** e a mensagem contém o texto. **Prefira o código do erro** (`erro:CS0103`), que é igual no editor e no `dotnet` |
| `aviso:TEXTO` | a compilação deu um aviso contendo o texto, por exemplo `aviso:CS0168` |
| `semaviso` | compilou sem nenhum aviso |
| `exit:N` | o programa terminou com o código N (exceção não tratada = 134, como no Linux) |
| `src:REGEX` | o código do leitor casa com a regex (para exigir um recurso, como `src:foreach\s*\(`) |

**Regras exatas (decididas antes de escrever; não invente outras):**
- **Regex** (`outre:`, `src:`, `erro:/…/`, `aviso:/…/`): é a regex normal do JavaScript. `|` é alternativa e `\|` é uma barra vertical literal.
- `out:` e `outre:` olham **só a saída do programa** (stdout e stderr, na ordem), nunca as mensagens do compilador. Se o programa não compilou, são falsas.
- `outre:` aplica a regex **à saída inteira, sem flags**: `^` e `$` são o começo e o fim de toda a saída. Escreva `\n` para as quebras: `outre:^Olá\nTchau\n$`.
- `erro:` e `aviso:` aceitam texto ou `/regex/`, também com flags (`/…/i`). `aviso:` olha cada linha `warning`.
- `exit:N` é o código do **programa** e é falso se ele não compilou.
- `src:` aplica a regex ao código de todas as abas, com a flag `m`.
- **Escapes no `data-goal`:** `\,` é vírgula literal; `\\` é uma barra invertida literal; qualquer outro `\x` fica como está (`\d`, `\n`, `\|` das regex). Uma vírgula sem escape só separa metas quando vem seguida do nome de uma meta. `>` e `&gt;` são a mesma coisa.
- O **código inicial não pode cumprir a meta**, e a **solução tem de cumprir** (o testador confere).
- **A meta não pode depender do que muda entre execuções ou entre o editor e o `dotnet`** (seção 4): números do `Random`, data/hora, `GetHashCode`, ordem de `HashSet`/`Dictionary` depois de remoções, tempos medidos.

### Outros blocos
`dl.anatomy`, `div.note/.tip/.warning/.cenario`, `ol.passo`, `div.table-wrap > table.ref`, `.exercise`, `.mc`, `figure`, `<span class="versao">C# 12</span>`.

No `.exercise`, `data-answer="a|b"` aceita respostas alternativas. Para uma barra vertical dentro da resposta (`||`), escreva `\|`. O site corta os espaços do começo e do fim da resposta.

## 4. O editor do guia: C# real no navegador (`assets/csharpsim.js`)
> **Esta seção é mantida pelo agente do simulador.** Tudo aqui foi conferido no motor final com `tools/sim.js` e `--nativo` (o `dotnet` do laboratório). Antes de escrever uma frase do tipo "no editor…" que não esteja aqui, confira com `tools/sim.js`.

*(Em construção. O objetivo é que o editor dê a **mesma saída** que o `dotnet run` do laboratório: mensagens do compilador em português, cultura pt-BR (`3,5`, `R$ 1.234,50`), exceções como no Linux.)*

### Ferramentas (Node 24 na VPS)
- `node tools/sim.js arquivo.cs`: compila e roda como o editor. Opções: `--stdin "Ana\n29"`, `--com outro.cs` (aba), `--args …`, `--nativo` (mostra também o `dotnet` do laboratório e as diferenças).
- `node tools/testar-missoes.js páginas.html` (atalho no notebook: `~/guia-csharp-lab/testar`): o código inicial **não** cumpre a meta e a solução **cumpre**; confere `&lt;`/`&amp;` em todos os `<pre>`; `--nativo` compara com o `dotnet` do laboratório.

**Testador pronto (17/10/2026, 16:00).** `~/guia-csharp-lab/testar pagina.html` (e `--nativo`) já funciona com o motor de verdade (Roslyn do laboratório + .NET 10 WebAssembly). A caixa no navegador vem logo depois; o resto desta seção será completado.


## 5. Fidelidade: o laboratório (`~/guia-csharp-lab/lab`, na VPS)
É a máquina da Ana do Guia Bash: usuária `ana`, computador `notebook`, `/home/ana`, pt_BR, Ubuntu 26.04 com o **.NET 10 SDK do próprio Ubuntu** (`dotnet --version` = `10.0.112`, C# 14).
```bash
printf '%s\n' 'mkdir -p cs && cd cs' "cat > ola.cs <<'FIM'" 'Console.WriteLine("Olá, mundo!");' 'FIM' 'dotnet run ola.cs' |
  ~/guia-c-lab/vps 'timeout 120 ~/guia-csharp-lab/lab -n SEUNOME -i'
```
- Opções: `-n SEUNOME` (pasta própria; **sempre** a sua), `-r` (recomeça do zero), `-i` (transcrição no formato do `pre.term`), `-t` (terminal de verdade: cores, entrada digitada, `Abortado (imagem do núcleo gravada)`), `-N` (sem rede).
  - Os processos do lab morrem quando ele termina (os servidores de build do `dotnet` não ficam soltos).
  - A pasta da Ana já passou pelo "primeiro uso" do .NET: a mensagem de boas-vindas não aparece. Para mostrar essa mensagem (só em `instalar-linux.html`), apague `~/.dotnet/*Sentinel` dentro do lab.
- **As mensagens saem em português**, como na máquina de quem usa o Ubuntu em pt-BR:
  - compilador: `/home/ana/cs/erro.cs(1,13): error CS0029: Não é possível converter implicitamente tipo "string" em "int"`;
  - fim: `Ocorreu uma falha no build. Corrija os erros de build e execute novamente.`;
  - `dotnet new`: `O modelo "Aplicativo do Console" foi criado com êxito.`.
  - Cite o inglês quando ajudar a pesquisar (`Cannot implicitly convert type 'string' to 'int'`): o código `CS0029` é o mesmo nas duas línguas.
- **As exceções saem em inglês** (o .NET no Linux não traduz): `Unhandled exception. System.IndexOutOfRangeException: Index was outside the bounds of the array.`, `at Program.<Main>$(String[] args) in /home/ana/cs/ex.cs:line 2`, código de saída **134**.
- **Cultura pt-BR:** `Console.WriteLine(3.5)` mostra `3,5`; `1234567.891.ToString("N2")` mostra `1.234.567,89`; `"C"` mostra `R$`. A aula `cultura.html` explica o `CultureInfo.InvariantCulture`.
- **Tempo:** o primeiro `dotnet run arquivo.cs` leva uns 6 s (compila); o segundo, sem mudar o arquivo, 0,3 s. Use `timeout 120` no lab e não meça tempo nas metas.
- Um processo por vez, sempre com `timeout`. Programas que podem travar: `timeout 5`.
- **Privacidade:** nada da máquina real nem da VPS. Os caminhos têm de ser `/home/ana/…`.

### Versões
O guia ensina **C# 14 com .NET 10 (LTS, novembro de 2025)** e diz a forma antiga quando houver (muito código e muitos cursos usam .NET 6/8 e `static void Main`).
- Marque recursos novos com `<span class="versao">C# 9</span>`, `C# 12` etc.
- **Confira no laboratório se cada recurso compila no `dotnet` 10** antes de afirmar. Para mostrar o erro de uma versão antiga, use `<LangVersion>` num projeto.

## 6. Escrita
- Português do Brasil, frases curtas, "você". O leitor nunca programou.
- Nomes em inglês ganham tradução: `Console.WriteLine` = "escrever linha no console"; `string` = texto.
- Exemplos com a vida da Ana: lista de compras, notas de alunos, uma lojinha, um jogo. Dinheiro sempre em `decimal`.
- Toda mensagem de erro é a real (do laboratório ou do `tools/sim.js`).
- Boas práticas desde o começo, sempre com o porquê: `TryParse` em vez de `Parse` com entrada do usuário, `decimal` para dinheiro, `using` para arquivos, nomes em PascalCase/camelCase, referências anuláveis ligadas.
