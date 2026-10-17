using System.Diagnostics;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Runtime.CompilerServices;
using System.Globalization;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Text;

namespace Motor;

/// Roda o programa compilado num runtime NOVO (um Web Worker / worker_thread por execução):
/// saída para o JavaScript, entrada, args, pasta com os arquivos das abas, cultura pt-BR,
/// exceção não tratada como no Linux ("Unhandled exception. …", código 134).
public static partial class Executor
{
    internal static int bytes;
    static readonly (string, bool)[] ChavesAot = [
        ("System.ComponentModel.DefaultValueAttribute.IsSupported", false),
        ("System.ComponentModel.Design.IDesignerHost.IsSupported", false),
        ("System.ComponentModel.TypeConverter.EnableUnsafeBinaryFormatterInDesigntimeLicenseContextSerialization", false),
        ("System.ComponentModel.TypeDescriptor.IsComObjectDescriptorSupported", false),
        ("System.Data.DataSet.XmlSerializationIsSupported", false),
        ("System.Diagnostics.Tracing.EventSource.IsSupported", false),
        ("System.Linq.Enumerable.IsSizeOptimized", true),
        ("System.Net.SocketsHttpHandler.Http3Support", false),
        ("System.Reflection.Metadata.MetadataUpdater.IsSupported", false),
        ("System.Resources.ResourceManager.AllowCustomResourceTypes", false),
        ("System.Resources.UseSystemResourceKeys", false),
        ("System.Runtime.CompilerServices.RuntimeFeature.IsDynamicCodeSupported", false),
        ("System.Runtime.InteropServices.BuiltInComInterop.IsSupported", false),
        ("System.Runtime.InteropServices.EnableConsumingManagedCodeFromNativeHosting", false),
        ("System.Runtime.InteropServices.EnableCppCLIHostActivation", false),
        ("System.Runtime.InteropServices.Marshalling.EnableGeneratedComInterfaceComImportInterop", false),
        ("System.Runtime.Serialization.EnableUnsafeBinaryFormatterSerialization", false),
        ("System.StartupHookProvider.IsSupported", false),
        ("System.Text.Encoding.EnableUnsafeUTF7Encoding", false),
        ("System.Text.Json.JsonSerializer.IsReflectionEnabledByDefault", false),
        ("System.Threading.Thread.EnableAutoreleasePool", false),
        ("System.Linq.Expressions.CanEmitObjectArrayDelegate", false),
    ];
    [JSImport("inicio", "motor")] static partial void Inicio(string quadro);
    internal static string? entrada;
    static string? quadroInicio;
    // como o CoreCLR escreve os tipos no relatório de estouro de pilha: Int32 (primitivos), System.String (os outros)
    static string NomeEstouro(Type t) => t.IsPrimitive ? t.Name : SemArgsGenericos(t.FullName ?? t.Name);

    [JSExport]
    public static async Task<int> Rodar(byte[] dll, byte[] pdb, string[] args, string pasta, string[] nomes, string[] conteudos, string? stdin, string arquivoUnico, string chaves)
    {
        var ch = chaves.Split(',');
        // dotnet run arquivo.cs liga o PublishAot: as mesmas chaves do .runtimeconfig.json que o SDK gera
        // (ex.: o JsonSerializer sem contexto lança "Reflection-based serialization has been disabled…")
        if (ch.Contains("aot")) foreach (var (k, v) in ChavesAot) AppContext.SetSwitch(k, v);
        if (arquivoUnico.Length > 0)
        {
            AppContext.SetData("EntryPointFilePath", arquivoUnico);
            AppContext.SetData("EntryPointFileDirectoryPath", Path.GetDirectoryName(arquivoUnico));
        }
        // #:property InvariantGlobalization=true: cultura invariante (aproximação do modo invariante do .NET)
        var pt = ch.Contains("invariante") ? CultureInfo.InvariantCulture : new CultureInfo("pt-BR");
        CultureInfo.DefaultThreadCurrentCulture = pt; CultureInfo.DefaultThreadCurrentUICulture = pt;
        CultureInfo.CurrentCulture = pt; CultureInfo.CurrentUICulture = pt;
        Directory.CreateDirectory(pasta);
        for (int i = 0; i < nomes.Length; i++)
        {
            string caminho = Path.Combine(pasta, nomes[i]);
            Directory.CreateDirectory(Path.GetDirectoryName(caminho)!);
            File.WriteAllText(caminho, conteudos[i]);
        }
        Directory.SetCurrentDirectory(pasta);
        var saida = new Saida();
        Console.SetOut(new Escritor(saida, 1));
        Console.SetError(new Escritor(saida, 2));
        Console.SetIn(stdin != null ? new StringReader(stdin) : new LeitorJs(saida));
        // Environment.Exit(n): o que estava no buffer sai antes de o runtime terminar
        AppDomain.CurrentDomain.ProcessExit += (_, _) => saida.Descarregar();
        // exceção fora do Main (async void, timer…): como o .NET, relatório e código 134
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            if (e.ExceptionObject is Exception ex) Relatar(saida, ex, false);
            saida.Descarregar();
            Environment.Exit(134);
        };
        // Debug.Assert/Debug.Fail: "Process terminated. Assertion failed." e 134 (o Mono do navegador perderia a saída)
        Afirmacoes.Instalar(saida);
        // async void: a exceção vai para o SynchronizationContext; sem ele, o Mono do navegador morreria calado
        SynchronizationContext.SetSynchronizationContext(new Contexto(saida));
        Environment.ExitCode = 0;
        try
        {
            var asm = Assembly.Load(dll, pdb.Length > 0 ? pdb : null);
            Linhas.Preparar(asm, pdb);
            var ep = asm.EntryPoint ?? throw new InvalidOperationException("o programa não tem ponto de entrada");
            // async Main: o compilador gera "<Main>" (síncrono, faz GetAwaiter().GetResult(), que trava no WebAssembly
            // de uma thread só). Chamamos direto o método assíncrono e esperamos com await.
            MethodInfo alvo = ep;
            Executor.entrada = null;
            if (ep.Name == "<Main>")
            {
                var tipos = ep.GetParameters().Select(p => p.ParameterType).ToArray();
                var asy = ep.DeclaringType!.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
                    .FirstOrDefault(m => m != ep && (m.Name == "<Main>$" || m.Name == "Main") && typeof(Task).IsAssignableFrom(m.ReturnType)
                        && m.GetParameters().Select(p => p.ParameterType).SequenceEqual(tipos));
                if (asy != null)
                {
                    alvo = asy;
                    // o quadro do "<Main>" síncrono, que o .NET mostra no fim da pilha
                    Executor.entrada = "   at " + (ep.DeclaringType!.FullName ?? "Program").Replace('+', '.') + "." + ep.Name + "(" + string.Join(", ", ep.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name)) + ")";
                }
            }
            // para o JavaScript completar a mensagem de estouro de pilha (o Mono corta a pilha em 1000 quadros)
            quadroInicio = "   at " + (alvo.DeclaringType?.FullName ?? "Program").Replace('+', '.') + "." + alvo.Name + "(" + string.Join(", ", alvo.GetParameters().Select(p => NomeEstouro(p.ParameterType))) + ")";
            Inicio(quadroInicio[6..]);
            object?[]? parametros = alvo.GetParameters().Length == 1 ? [args] : null;
            object? r = alvo.Invoke(null, BindingFlags.DoNotWrapExceptions, null, parametros, null);
            int codigo = 0;
            if (r is Task t)
            {
                await t;
                if (t.GetType().IsGenericType && t.GetType().GetProperty("Result")?.GetValue(t) is int ri) codigo = ri;
            }
            else if (r is int i) codigo = i;
            // Main sem valor de retorno: vale o Environment.ExitCode
            if (alvo.ReturnType == typeof(void) || alvo.ReturnType == typeof(Task)) codigo = Environment.ExitCode;
            saida.Descarregar();
            return codigo;
        }
        // o filtro (when) roda ANTES dos finally do programa, como o relatório do .NET para uma exceção não tratada
        catch (Exception ex) when (Relatar(saida, ex))
        {
            saida.Descarregar(); // a saída dos finally, que rodaram depois do relatório
            return 134;
        }
    }

    // "Stack overflow." / "Repeated N times:" / o bloco repetido / o resto da pilha (nomes completos, sem arquivo)
    static string Estouro(Exception ex)
    {
        var q = new List<string>();
        foreach (var f in new StackTrace(ex, false).GetFrames() ?? [])
        {
            var m = f.GetMethod();
            if (m == null) continue;
            var tn = (m.DeclaringType?.FullName ?? "").Replace('+', '.');
            if (tn.StartsWith("Motor.") || tn.StartsWith("System.Reflection.") || tn.StartsWith("System.RuntimeMethodHandle")) continue;
            q.Add("   at " + SemArgsGenericos(tn) + "." + m.Name + "(" + string.Join(", ", m.GetParameters().Select(p => NomeEstouro(p.ParameterType))) + ")");
        }
        // o Mono corta a pilha em ~1000 quadros: o Main (de onde tudo começou) fica de fora
        if (quadroInicio != null && (q.Count == 0 || q[^1] != quadroInicio)) q.Add(quadroInicio);
        if (entrada != null) q.Add(entrada.Replace("String[] args", "System.String[]"));
        var sb = new StringBuilder("Stack overflow.\n");
        for (int i = 0; i < q.Count;)
        {
            int j = i; while (j < q.Count && q[j] == q[i]) j++;
            if (j - i > 1) sb.Append("Repeated ").Append(j - i).Append(" times:\n--------------------------------\n").Append(q[i]).Append("\n--------------------------------\n");
            else sb.Append(q[i]).Append('\n');
            i = j;
        }
        return sb.ToString();
    }

    internal static bool Relatar(Saida saida, Exception ex, bool doMain = true)
    {
        try
        {
            saida.Descarregar();
            // como o .NET do Linux: estouro de pilha e falta de memória têm mensagens próprias (sem "Unhandled exception.")
            if (ex is StackOverflowException) saida.Escrever(2, Estouro(ex));
            else if (ex is OutOfMemoryException && ex.GetType() == typeof(OutOfMemoryException)) saida.Escrever(2, "Out of memory.\n");
            else saida.Escrever(2, "Unhandled exception. " + FormatarExcecao(ex, doMain) + "\n");
            saida.Descarregar();
        }
        catch { }
        return true;
    }

    // como o .NET mostra ("   at Program.<Main>$(String[] args) in /home/ana/cs/ex.cs:line 2"), sem as linhas do
    // próprio executor (Motor.*, System.Reflection.*). O runtime WebAssembly (Mono) não põe " in arquivo:line N":
    // o Linhas acrescenta, lendo o PDB do programa.
    static string FormatarExcecao(Exception ex, bool doMain)
    {
        var linhas = ex.ToString().Split('\n').Select(l => SemArgsGenericos(l.TrimEnd('\r'))).ToList();
        Linhas.Completar(ex, linhas);
        var r = new List<string>();
        foreach (var l in linhas)
        {
            var s = l.TrimStart();
            if (s.StartsWith("at Motor.") || s.StartsWith("at System.Reflection.") || s.StartsWith("at System.RuntimeMethodHandle") || s.StartsWith("at (wrapper")) continue;
            r.Add(l);
        }
        while (r.Count > 0 && r[^1].TrimStart().StartsWith("--- End of stack trace")) r.RemoveAt(r.Count - 1);
        if (entrada != null && doMain) r.Add(entrada);
        return string.Join("\n", r);
    }

    // o Mono escreve "Dictionary`2[[System.String, System.Private.CoreLib, Version=…],[…]]"; o CoreCLR, "Dictionary`2"
    internal static string SemArgsGenericos(string l)
    {
        if (!l.Contains("`")) return l;
        var sb = new StringBuilder();
        for (int i = 0; i < l.Length; i++)
        {
            sb.Append(l[i]);
            if (l[i] == '`')
            {
                int j = i + 1;
                while (j < l.Length && char.IsDigit(l[j])) sb.Append(l[j++]);
                if (j > i + 1 && j + 1 < l.Length && l[j] == '[' && l[j + 1] == '[')
                {
                    int prof = 0, k = j;
                    for (; k < l.Length; k++) { if (l[k] == '[') prof++; else if (l[k] == ']' && --prof == 0) break; }
                    j = k + 1;
                }
                i = j - 1;
            }
        }
        return sb.ToString();
    }

    [JSExport] public static int Bytes() => bytes;
}

/// Junta stdout e stderr na ordem e manda para o JavaScript em pedaços (não a cada caractere).
sealed partial class Saida
{
    readonly StringBuilder buf = new();
    int fdAtual = 1;
    readonly Stopwatch relogio = Stopwatch.StartNew();
    long ultimo;
    public void Escrever(int fd, string s)
    {
        if (s.Length == 0) return;
        if (fd != fdAtual && buf.Length > 0) Descarregar();
        fdAtual = fd;
        buf.Append(s);
        if (buf.Length > 8192 || (relogio.ElapsedMilliseconds - ultimo > 40 && s.Contains('\n'))) Descarregar();
    }
    public void Escrever(int fd, char c)
    {
        if (fd != fdAtual && buf.Length > 0) Descarregar();
        fdAtual = fd;
        buf.Append(c);
        if (buf.Length > 8192 || (c == '\n' && relogio.ElapsedMilliseconds - ultimo > 40)) Descarregar();
    }
    public void Descarregar()
    {
        ultimo = relogio.ElapsedMilliseconds;
        if (buf.Length == 0) return;
        var s = buf.ToString();
        buf.Clear();
        Executor.bytes += s.Length;
        EscreverJs(fdAtual, s);
    }
    [JSImport("escrever", "motor")] static partial void EscreverJs(int fd, string texto);
}

sealed class Escritor(Saida saida, int fd) : TextWriter
{
    public override Encoding Encoding => Encoding.UTF8;
    public override void Write(char value) => saida.Escrever(fd, value);
    public override void Write(string? value) { if (value != null) saida.Escrever(fd, value); }
    public override void Write(char[] buffer, int index, int count) => saida.Escrever(fd, new string(buffer, index, count));
    public override void WriteLine(string? value) => saida.Escrever(fd, (value ?? "") + "\n");
    public override void Flush() => saida.Descarregar();
}

/// Entrada digitada pelo leitor. O JavaScript devolve a linha, "" (fim da entrada) ou null (ainda não digitou:
/// o executor encerra com o código 250 e a caixa roda o programa de novo com a linha nova — "repetição").
sealed partial class LeitorJs(Saida saida) : TextReader
{
    string pendente = "";
    bool fim;
    bool Encher()
    {
        if (pendente.Length > 0) return true;
        if (fim) return false;
        saida.Descarregar();
        var l = LerJs();
        if (l == null) { PararJs(); Environment.Exit(250); }
        if (l == "") { fim = true; return false; }
        pendente = l;
        return true;
    }
    public override int Peek() => Encher() ? pendente[0] : -1;
    public override int Read()
    {
        if (!Encher()) return -1;
        char c = pendente[0]; pendente = pendente[1..]; return c;
    }
    public override string? ReadLine()
    {
        if (!Encher()) return null;
        int i = pendente.IndexOf('\n');
        string l;
        if (i < 0) { l = pendente; pendente = ""; }
        else { l = pendente[..i]; pendente = pendente[(i + 1)..]; }
        return l.TrimEnd('\r');
    }
    public override string ReadToEnd()
    {
        var sb = new StringBuilder();
        while (Encher()) { sb.Append(pendente); pendente = ""; }
        return sb.ToString();
    }
    [JSImport("lerEntrada", "motor")] private static partial string? LerJs();
    [JSImport("pedirEntrada", "motor")] static partial void PararJs();
}

/// Arquivo e linha de cada quadro do programa do leitor, a partir do PDB portátil gerado pelo Roslyn.
/// (No Mono, a pilha de uma exceção que passou por await ainda tem os quadros de onde ela nasceu.)
static class Linhas
{
    static Assembly? programa;
    static MetadataReader? leitor;
    static MetadataReaderProvider? provedor;

    public static void Preparar(Assembly asm, byte[] pdb)
    {
        programa = asm;
        if (pdb.Length == 0) return;
        provedor = MetadataReaderProvider.FromPortablePdbImage(System.Collections.Immutable.ImmutableArray.Create(pdb));
        leitor = provedor.GetMetadataReader();
    }

    static (string arquivo, int linha)? Local(StackFrame f)
    {
        var m = f.GetMethod();
        if (leitor == null || m == null || m.Module.Assembly != programa) return null;
        int il = f.GetILOffset();
        if (il < 0) return null;
        try
        {
            var h = MetadataTokens.MethodDefinitionHandle(m.MetadataToken);
            var info = leitor.GetMethodDebugInformation(h.ToDebugInformationHandle());
            string? arq = null; int linha = 0;
            foreach (var sp in info.GetSequencePoints())
            {
                if (sp.Offset > il) break;
                if (sp.IsHidden) continue;
                linha = sp.StartLine;
                arq = leitor.GetString(leitor.GetDocument(sp.Document).Name);
            }
            return arq == null ? null : (arq, linha);
        }
        catch { return null; }
    }

    // nome como o StackTrace mostra: "Tipo.Método(" (MoveNext de async/iterador → o método original)
    static string Chave(MethodBase m)
    {
        var t = m.DeclaringType;
        string nome = m.Name;
        if (nome == "MoveNext" && t != null && t.Name.StartsWith('<'))
        {
            int f = t.Name.LastIndexOf('>');
            if (f > 1) { nome = t.Name[1..f]; t = t.DeclaringType; }
        }
        return "." + nome + "(";
    }

    public static void Completar(Exception ex, List<string> linhas)
    {
        var quadros = new List<StackFrame>();
        // o ToString() mostra primeiro a pilha da exceção mais interna (InnerException), depois as de fora
        var cadeia = new List<Exception>();
        for (Exception? e = ex; e != null; e = e.InnerException) cadeia.Add(e);
        cadeia.Reverse();
        foreach (var e in cadeia)
            quadros.AddRange((new StackTrace(e, false).GetFrames() ?? []).Where(f => f.GetMethod()?.Module.Assembly == programa));
        int q = 0;
        for (int i = 0; i < linhas.Count && q < quadros.Count; i++)
        {
            var l = linhas[i];
            if (!l.StartsWith("   at ") || l.Contains(" in ")) continue;
            for (int k = q; k < quadros.Count; k++)
            {
                var m = quadros[k].GetMethod()!;
                if (!l.Contains(Chave(m))) continue;
                var loc = Local(quadros[k]);
                if (loc != null) linhas[i] = l + " in " + loc.Value.arquivo + ":line " + loc.Value.linha;
                q = k + 1;
                break;
            }
        }
    }
}

/// Debug.Assert/Debug.Fail como no .NET do Linux: "Process terminated. Assertion failed.", a mensagem, a pilha e 134.
/// (O DebugProvider não é público nos reference assemblies; o gancho interno s_FailCore é o que os testes do .NET usam.)
static class Afirmacoes
{
    static Saida? saida;
    public static void Instalar(Saida s)
    {
        saida = s;
        try
        {
            var t = typeof(object).Assembly.GetType("System.Diagnostics.DebugProvider");
            var f = t?.GetField("s_FailCore", BindingFlags.NonPublic | BindingFlags.Static);
            f?.SetValue(null, new Action<string, string?, string?, string>(Falhar));
        }
        catch { }
    }
    static void Falhar(string pilha, string? message, string? detailMessage, string origem)
    {
        var sb = new StringBuilder("Process terminated.\nAssertion failed.\n");
        if (!string.IsNullOrEmpty(message)) sb.Append(message).Append('\n');
        if (!string.IsNullOrEmpty(detailMessage)) sb.Append(detailMessage).Append('\n');
        var linhas = new StackTrace(true).ToString().Split('\n');
        foreach (var l in linhas)
        {
            var t = l.TrimStart();
            if (t.Length == 0 || t.StartsWith("at Motor.") || t.StartsWith("at System.Diagnostics.Debug") || t.StartsWith("at System.Reflection.") || t.StartsWith("at System.Runtime") || t.StartsWith("at System.Threading.Tasks.") || t.StartsWith("at (wrapper")) continue;
            sb.Append(Executor.SemArgsGenericos(l.TrimEnd('\r'))).Append('\n');
        }
        saida!.Descarregar();
        saida.Escrever(2, sb.ToString());
        saida.Descarregar();
        Environment.Exit(134);
    }
}

/// Roda as continuações no pool (como sem contexto); uma exceção que escapa (async void) termina o programa
/// como no .NET: "Unhandled exception. …" e 134.
sealed class Contexto(Saida saida) : SynchronizationContext
{
    public override void Post(SendOrPostCallback d, object? state) => ThreadPool.UnsafeQueueUserWorkItem(_ => Rodar(d, state), null);
    public override void Send(SendOrPostCallback d, object? state) => Rodar(d, state);
    public override SynchronizationContext CreateCopy() => this;
    void Rodar(SendOrPostCallback d, object? state)
    {
        var antes = Current;
        SetSynchronizationContext(this);
        try { d(state); }
        catch (Exception ex) when (Executor.Relatar(saida, ex, false)) { saida.Descarregar(); Environment.Exit(134); }
        finally { SetSynchronizationContext(antes); }
    }
}
