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
    internal static string? entrada;

    [JSExport]
    public static async Task<int> Rodar(byte[] dll, byte[] pdb, string[] args, string pasta, string[] nomes, string[] conteudos, string? stdin)
    {
        var pt = new CultureInfo("pt-BR");
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
            object?[]? parametros = alvo.GetParameters().Length == 1 ? [args] : null;
            object? r = alvo.Invoke(null, BindingFlags.DoNotWrapExceptions, null, parametros, null);
            int codigo = 0;
            if (r is Task t)
            {
                await t;
                if (t.GetType().IsGenericType && t.GetType().GetProperty("Result")?.GetValue(t) is int ri) codigo = ri;
            }
            else if (r is int i) codigo = i;
            saida.Descarregar();
            return codigo;
        }
        catch (Exception ex)
        {
            saida.Descarregar();
            saida.Escrever(2, "Unhandled exception. " + FormatarExcecao(ex) + "\n");
            saida.Descarregar();
            return 134;
        }
    }

    // como o .NET mostra ("   at Program.<Main>$(String[] args) in /home/ana/cs/ex.cs:line 2"), sem as linhas do
    // próprio executor (Motor.*, System.Reflection.*). O runtime WebAssembly (Mono) não põe " in arquivo:line N":
    // o Linhas acrescenta, lendo o PDB do programa.
    static string FormatarExcecao(Exception ex)
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
        if (entrada != null) r.Add(entrada);
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
        for (Exception? e = ex; e != null; e = e.InnerException)
        {
            quadros.AddRange((new StackTrace(e, false).GetFrames() ?? []).Where(f => f.GetMethod()?.Module.Assembly == programa));
        }
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
