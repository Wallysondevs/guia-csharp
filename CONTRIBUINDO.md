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

**Testador pronto (17/10/2026, 16:00).** O motor atual é o do commit mais recente de `assets/cs/` (o testador mostra a versão no fim: `motor …`).

### O que é o motor
- **Compilador:** o Roslyn **do próprio SDK 10.0.112 do laboratório** (`5.0.0-2.26422.108`), com as opções do `dotnet run arquivo.cs`: C# 14, `Nullable` enable, os mesmos `global using` do ImplicitUsings (`System`, `System.Collections.Generic`, `System.IO`, `System.Linq`, `System.Net.Http`, `System.Threading`, `System.Threading.Tasks`), `/warn:10`, Debug (`DEBUG` e `TRACE` definidos), `/nowarn:1701,1702`, `/features:FileBasedProgram`. Mensagens **em pt-BR** (os satélites do mesmo SDK).
- **Analisadores e geradores do SDK**, como no `dotnet run`: os avisos `CA…` do nível padrão e, num arquivo só (que liga o `PublishAot`), os `IL2026`/`IL3050`; os geradores `[GeneratedRegex]`, `JsonSerializerContext`, `[LibraryImport]`.
- **Etapas como o `csc`:** se há erro de sintaxe, só os erros de sintaxe aparecem; depois os de declaração; só então os do corpo dos métodos. A ordem das linhas é a do `dotnet`. `CS5001` (sem `Main`) só aparece quando não há outro erro.
- **`#:property`** (num arquivo só) vale: `CheckForOverflowUnderflow`, `Nullable`, `LangVersion`, `AllowUnsafeBlocks`, `TreatWarningsAsErrors`, `WarningsAsErrors`, `NoWarn`, `WarningLevel`, `ImplicitUsings`, `DefineConstants`, `Optimize`, `PublishAot=false` e `InvariantGlobalization=true` (aproximado: cultura invariante). **`#:package` não**: o editor não baixa pacotes (dá `CS0246`).
- **Runtime:** .NET 10.0.13 (Mono) em WebAssembly, com a biblioteca inteira (sem trimming), ICU com pt-BR, fuso `America/Sao_Paulo`, cultura **pt-BR** (`3,5`, `R$ 1.234,50`, datas em português), usuário `/home/ana`. **Cada execução usa um runtime novo** (estado limpo).
- Num arquivo só, as chaves de runtime do `PublishAot` também valem: `JsonSerializer` sem contexto lança `InvalidOperationException: Reflection-based serialization has been disabled…` (igual ao lab). Com 2 ou mais `.cs` (projeto) ou `#:property PublishAot=false`, funciona.

### O que a caixa mostra
- Um `.cs`: `ana@notebook:~/cs$ dotnet run Program.cs` (ou o `data-file`), e os caminhos `/home/ana/cs/ARQUIVO.cs(linha,coluna): error CSxxxx: …`.
- Dois ou mais `.cs` (abas): `ana@notebook:~/projetos/Exemplo$ dotnet run`, e cada diagnóstico termina com ` [/home/ana/projetos/Exemplo/Exemplo.csproj]`, como no lab.
- Build com erro: as linhas do compilador, uma linha em branco, `Ocorreu uma falha no build. Corrija os erros de build e execute novamente.` e `[código de saída: 1]` (o `$?` do lab também é 1).
- Depois da saída: `[código de saída: N]` (0, o `return N`, `Environment.Exit(N)`, `Environment.ExitCode`, 134 para exceção não tratada, estouro de pilha, `Debug.Assert`).
- Exceção não tratada: `Unhandled exception. System.…: mensagem` + `   at … in /home/ana/cs/ARQ.cs:line N` (em inglês, como no Linux) e 134. O relatório sai antes dos `finally`, como no lab. `async void` também dá o relatório e 134.
- Estouro de pilha: `Stack overflow.`, `Repeated N times:`, o bloco repetido e o `Main`, código 134 (o N é outro: ~999 no editor).
- `Console.ForegroundColor`/`BackgroundColor`/`ResetColor`: **as cores aparecem no terminal da caixa**. As metas `out:`/`outre:` e o testador olham o texto **sem** os códigos de cor (como o lab com `-i`, que não mostra cor). `Console.WindowWidth` = 80, `WindowHeight` = 24.

### Entrada digitada (sem `data-stdin`)
- Quando o programa chama `Console.ReadLine()` (ou `Read`, `ReadKey`) e a caixa não tem `data-stdin`, aparece **um campo no terminal da caixa**, logo depois da pergunta. O leitor digita e tecla **Enter**. **Ctrl+D** = fim da entrada (`ReadLine()` devolve `null`); **Ctrl+C** ou **Parar** interrompe.
- **Como funciona ("repetição"):** o navegador não deixa o programa WebAssembly esperar o teclado. Quando ele pede uma linha que ainda não foi digitada, o editor o encerra, mostra o campo e, depois do Enter, **roda o programa de novo desde o começo** com as linhas já digitadas. A saída é a mesma, e o `Random` usa a **mesma semente** nas repetições (um jogo de adivinhação mantém o número secreto). Só muda o que depende do relógio (`DateTime.Now`, tempo medido) e o que o programa faz "por fora" antes de perguntar (por exemplo, um arquivo escrito é escrito de novo, numa pasta limpa).
- `Console.ReadKey()`: digitando, devolve a primeira letra da linha (o resto da linha é descartado); com `data-stdin` (entrada redirecionada), dá `InvalidOperationException: Cannot read keys when either application does not have a console or when console input has been redirected. Try Console.Read.`, igual ao lab com `-i`.
- No testador e no `sim.js`, sem `data-stdin`/`--stdin`, o programa recebe **fim da entrada** (`null`) e o testador avisa ("lê a entrada sem data-stdin").

### HTML dentro do `.trycs`
- Os `pre.script` viram as abas e os `pre.solucao` ficam escondidos (botão Ver solução). O editor é acrescentado **no fim** da caixa; todo o resto do HTML da caixa fica onde está, acima dele: `p.try-task`, `ul`, `ol`, `div.note`, `div.tip`, `table`, `code` etc. funcionam.
- Não ponha outro `pre` (`pre.file`, `pre.term`) dentro do `.trycs`: ele apareceria no meio da caixa. Ponha antes ou depois dela.

### Download e tempo (conferidos no Chromium da VPS)
- **Primeiro clique em Rodar:** baixa **≈ 17 MB** (`assets/cs/motor.pak.gz` 12,8 MB + `refs.pak.gz` 4,4 MB, gzip), uma vez só: fica na Cache API do navegador (as outras caixas, páginas e visitas não baixam de novo). Barra de progresso na caixa; depois, "Preparando o compilador…" (2 a 5 s).
- **Depois:** compilar leva 0,1 a 0,5 s (o primeiro de cada página, ~1 s); cada programa roda num runtime novo, que já fica pronto em segundo plano (0,2 a 0,5 s). No testador (Node), cada caixa leva ~0,3 s, e a primeira de cada execução, ~3 s.
- O programa é **interpretado**: contas pesadas são ~5 a 10× mais lentas que no lab (50 milhões de somas: 1,4 s × 0,18 s). O editor para o programa depois de **15 s** (o testador, depois de 10 s) e com mais de 2 MB de saída.
- Precisa de um navegador atual com Web Workers de módulo e `DecompressionStream` (Chrome/Edge 80+, Firefox 114+, Safari 16.4+). Não usa JSPI nem `SharedArrayBuffer` (conferido com e sem JSPI no Chromium).

### Editor × `dotnet` do laboratório (conferido com `--nativo`, 48 programas)
**Iguais:** mensagens e códigos `CSxxxx` (erros e avisos, pt-BR, mesma ordem), avisos `CA`/`IL`, cultura pt-BR (números, `C`/`N2`/`P1`, datas, nomes dos meses, `string.Compare`, ordenação com acento, `ToUpper`), fuso e `ToLocalTime`, `en-US`/`de-DE`/`InvariantCulture`, `double`/`float`/`decimal`/`BigInteger`/`Int128`/`Half`, LINQ, `record`, `ToString()` de coleções e tuplas, `Random(42)` com semente, `File`/`StreamReader`/`StreamWriter`/`Directory` (em `/home/ana/cs`), `args`, `ReadLine`/`Read`/`In.ReadToEnd`, `Environment.Exit`/`ExitCode`/`return N`, exceções (tipo, mensagem, `InnerException`, linhas do código do leitor, 134, `ex.ToString()` no `catch`), `finally`, `Debug.Assert` (`Process terminated.` / `Assertion failed.` + 134), `async`/`await`, `Task.Delay`, `Task.WhenAll`, cancelamento, `Task.Run` + `await`, `Parallel.For`/PLINQ (rodam em sequência, mesmo resultado), `Thread.Sleep`, `Regex` e `[GeneratedRegex]`, `JsonSerializer` (inclusive a exceção do `PublishAot`), `field` e `extension` do C# 14, `Console.Clear()`.

| Situação | `dotnet` do lab | Editor |
| --- | --- | --- |
| `(long)(object)5` e outros "unboxing" errados | `Unable to cast object of type 'System.Int32' to type 'System.Int64'.` | `Specified cast is not valid.` (mesma exceção `InvalidCastException`) |
| Linhas **internas do .NET** no rastro (`int.Parse`, `List.Sort`, `JsonSerializer`…) | poucas; genéricos como `GetTypeInfo[T]`, `Dictionary`2.get_Item(TKey key)` | às vezes outras ou mais; `GetTypeInfo[Pessoa]`, `get_Item(String key)`. As linhas do código do leitor são iguais |
| `throw;` (relançar) | a linha do método que relança é a da chamada | a linha do `throw;` |
| Estouro de pilha | `Repeated 261941 times:` | `Repeated 999 times:` (o resto igual) |
| `async void` que lança | rastro com `ThreadPoolWorkQueue.Dispatch()` etc. | rastro mais curto (mensagem e 134 iguais) |
| `Math.Cbrt(27)` | `3,0000000000000004` | `3` (as outras funções de `Math` testadas são iguais) |
| `double` → `nint`/`nuint` fora da faixa (`(nint)1e30`) | `9223372036854775807` (64 bits) | `-2147483648` (o `nint` tem 32 bits no WebAssembly). Para `int`, `long`, `uint`, `ulong`, `short`, `byte`, `char`… o editor imita a conversão saturante do .NET 9+ (`(int)1e20` = `2147483647`, `(int)NaN` = `0`): igual |
| Culturas asiáticas (`ja-JP`…) | `￥1,235`, datas no formato japonês | a linha **inteira** sai no formato pt-BR (`1.234,50 | ￥ 1.235 | 17/10/2026 | sábado`…): dados ICU diferentes; pt-BR, en-US, de-DE iguais |
| `Environment.UserName`, `MachineName`, `OSVersion.Platform` | `ana`, `notebook`, `Unix` | `Browser`, `localhost`, `Other` |
| `Environment.ProcessorCount`, `Is64BitProcess`, `IntPtr.Size`/`nint.Size` | 8, `True`, 8 | 1, `False`, 4 |
| `Environment.Version`, `RuntimeInformation.FrameworkDescription` | `10.0.12`, `.NET 10.0.12` | `10.0.13`, `.NET 10.0.13` |
| `Assembly.GetEntryAssembly()`, `AppContext.BaseDirectory` | o programa, `~/.local/share/dotnet/runfile/…/bin/debug/` | `null`/`Motor`, `/` |
| `new Thread(…).Start()` | roda | `PlatformNotSupportedException: Operation is not supported on this platform.` (o navegador tem uma thread só) |
| `.Wait()`/`.Result` de uma tarefa que ainda **não terminou** (ex.: `Task.Delay(100).Wait()`) | espera | `PlatformNotSupportedException: Cannot wait on monitors on this runtime.` (use `await`) |
| `Process.Start` | roda | `PlatformNotSupportedException: System.Diagnostics.Process is not supported on this platform.` |
| `HttpClient` | funciona | no **navegador**, só sites com CORS liberado (os outros: `HttpRequestException`); no **testador** (Node) funciona. Não use internet em missões |
| `#:package` | baixa e compila | `CS0246` (o editor não baixa pacotes) |
| `Console.ForegroundColor` (get) | `-1` até escolher uma cor | igual (`-1`); as cores **aparecem** na caixa (no lab `-i`, não) |
| `Console.ReadKey()` digitando | lê uma tecla (`lab -t`) | a 1ª letra da linha digitada + Enter |
| O mesmo aviso de novo, sem mudar o arquivo | some (build incremental) | aparece sempre |
| Falta de memória sem tratamento (`new int[int.MaxValue]`) | `Out of memory.` e 134 | igual |
| Exceção dentro de `Parallel.For`/`Parallel.ForEach` | vem embrulhada em `AggregateException` | vem **sem** embrulho (o `catch (AggregateException)` não pega; termina com 134). `Parallel.Invoke` e PLINQ embrulham igual |
| `Console.CancelKeyPress += …` | instala o tratador do Ctrl+C | `PlatformNotSupportedException` (134): mostre só no `pre.term` |
| `Environment.GetFolderPath(SpecialFolder.MyDocuments)` | `/home/ana/Documentos` | texto vazio (use `UserProfile`) |
| Coletor de lixo: `GC.GetGeneration`, `MaxGeneration`, finalizadores | gerações 0–2, finalizador roda depois de `GC.Collect` + `WaitForPendingFinalizers` | sempre 0, `MaxGeneration` 1, finalizadores não rodam |
| Falta de memória **com** `catch` | `Array dimensions exceeded supported range.` | `Out of memory` |
| Tempo medido (`Stopwatch`) | rápido | 5 a 10× mais lento |

**Regras para as metas** (além das da seção 3): não use em `out:`/`outre:` linhas internas do .NET num rastro, nem o texto do `InvalidCastException` de unboxing, nem o `N` do estouro de pilha, nem nada da tabela acima. Prefira o tipo da exceção (`out:IndexOutOfRangeException`), `exit:134` e as linhas do código do leitor.

### Ferramentas (Node 24 na VPS)
- `node tools/sim.js arquivo.cs`: compila e roda como o editor. Opções: `--stdin "Ana\n29"`, `--com outro.cs` (aba; com 2+ `.cs` vira projeto), `--args "Ana 'Maria Clara' 29"` (ou os argumentos soltos, ou depois de `--`), `--nativo` (mostra também o `dotnet` do laboratório e as diferenças).
- `node tools/testar-missoes.js páginas.html` (atalho no notebook: `~/guia-csharp-lab/testar`): o código inicial **não** cumpre a meta e a solução **cumpre**; confere `&lt;`/`&amp;` em todos os `<pre>`, metas e regex válidas, `pre.solucao` presente; guarda um cache (`--sem-cache` ignora). `-v` mostra as saídas. `--nativo` compara com o `dotnet` do laboratório (pasta própria por execução, apagada no fim; um processo por vez; `timeout`): diferença é só informação, mas **meta não cumprida no lab conta como falha**.
- Página de teste com um exemplo de cada recurso: `tools/demo.html`.
- Reconstruir o motor (só o agente do simulador): `bash tools/construir-cs.sh` (ver `assets/cs/LEIA.md`).

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

### Armadilhas do laboratório (relatadas pelos autores)
- **`dotnet run arquivo.cs` compila só aquele arquivo.** Uma classe em outro `.cs` dá `CS0246`; para vários arquivos, use um projeto (no editor, as abas já formam um projeto).
- **Avisos só na primeira compilação:** num segundo `dotnet run` sem mudar o arquivo (ou num `dotnet build` logo depois de um `run`), os `warning CS…` não aparecem. Para coletar avisos, mude o arquivo, use uma pasta nova ou `--no-incremental`. O editor compila sempre e mostra sempre.
- **Mensagens em inglês:** só `LANG=C` (ou `LANG=en_US.UTF-8`) funciona; `DOTNET_CLI_UI_LANGUAGE` não traduz o compilador. O servidor de compilação **guarda a língua** da sessão: faça o inglês numa sessão separada do lab (ou `dotnet build-server shutdown` antes de trocar).
- **Traduções pt-BR com erros:** algumas mensagens do compilador estão mal traduzidas, e duas invertem o sentido (CS0500, CS0037, CS1620; CS8618 "O propriedade", CS9260 "campo palavra-chave", CS0738 "porqu"). Cite como saem e explique o certo.
- **Ordem de avisos iguais** (ex.: vários CS0649) pode variar entre compilações: a meta não pode depender dela.
- **`-i` e o caractere nulo:** um programa que imprime `\0` faz o `-i` terminar com código 1 sem mostrar nada; use `lab -n X -- bash -c "…"` nesses casos.
- **`-t` e entrada:** dá para fazer um `dotnet run` interativo por sessão; o que for digitado a mais se perde quando o programa termina.
- **`/` é só leitura no lab:** gravar em `/etc` dá `IOException: Read-only file system`, e não o `UnauthorizedAccessException` de um Ubuntu de verdade. Para mostrar esse erro, use um arquivo seu com `chmod 444`.
- **Comentários `///`:** sem `GenerateDocumentationFile` (o padrão), os avisos de documentação (CS1591…) não aparecem, nem no editor nem no `dotnet`.

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
