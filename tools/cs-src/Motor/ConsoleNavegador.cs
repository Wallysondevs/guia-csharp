using System.Text;

namespace Motor;

/// O System.Console do .NET para navegador lança PlatformNotSupportedException em cores, tamanho da janela,
/// ReadKey etc. O tools/cs-src/Remendo troca o corpo desses métodos do System.ConsolePal por chamadas para cá,
/// com o comportamento de um terminal Linux: cores viram códigos ANSI (a caixa pinta; as metas e o testador
/// olham o texto sem eles), a janela tem 80×24, ReadKey lê da entrada.
public static class ConsoleNavegador
{
    // como o .NET do Linux com a saída redirecionada: -1 ("cor desconhecida") até o programa escolher uma
    static ConsoleColor frente = (ConsoleColor)(-1), fundo = (ConsoleColor)(-1);
    static readonly int[] Ansi = [30, 34, 32, 36, 31, 35, 33, 37, 90, 94, 92, 96, 91, 95, 93, 97];

    static void Escrever(string s) { Console.Out.Write(s); }

    public static Encoding get_InputEncoding() => new UTF8Encoding(false);
    public static void SetConsoleInputEncoding(Encoding e) { }
    public static bool get_TreatControlCAsInput() => false;
    public static void set_TreatControlCAsInput(bool v) { }
    public static ConsoleColor get_ForegroundColor() => frente;
    public static void set_ForegroundColor(ConsoleColor c) { if ((int)c is < 0 or > 15) throw new ArgumentException("The ConsoleColor enum value was not defined on that enum. Please use a defined color from the enum.", "value"); frente = c; Escrever("\x1b[" + Ansi[(int)c] + "m"); }
    public static ConsoleColor get_BackgroundColor() => fundo;
    public static void set_BackgroundColor(ConsoleColor c) { if ((int)c is < 0 or > 15) throw new ArgumentException("The ConsoleColor enum value was not defined on that enum. Please use a defined color from the enum.", "value"); fundo = c; Escrever("\x1b[" + (Ansi[(int)c] + 10) + "m"); }
    public static void ResetColor() { frente = (ConsoleColor)(-1); fundo = (ConsoleColor)(-1); Escrever("\x1b[0m"); }
    public static int get_CursorSize() => 100;
    public static void set_CursorSize(int v) { }
    public static bool get_CursorVisible() => true;
    public static void set_CursorVisible(bool v) { }
    public static (int, int) GetCursorPosition() => (0, 0);
    public static string get_Title() => "";
    public static void set_Title(string v) { }
    public static void Beep() { }
    public static void Beep(int f, int d) { }
    public static void SetCursorPosition(int l, int t) { }
    public static int get_BufferWidth() => 80;
    public static void set_BufferWidth(int v) { }
    public static int get_BufferHeight() => 24;
    public static void set_BufferHeight(int v) { }
    public static void SetBufferSize(int w, int h) { }
    public static int get_LargestWindowWidth() => 80;
    public static int get_LargestWindowHeight() => 24;
    public static void set_WindowLeft(int v) { }
    public static void set_WindowTop(int v) { }
    public static int get_WindowWidth() => 80;
    public static void set_WindowWidth(int v) { }
    public static int get_WindowHeight() => 24;
    public static void set_WindowHeight(int v) { }
    public static void SetWindowPosition(int l, int t) { }
    public static void SetWindowSize(int w, int h) { }

    /// Com data-stdin (entrada redirecionada), igual ao Linux: InvalidOperationException. Digitando no terminal
    /// da caixa: a primeira tecla da linha digitada (o resto da linha é descartado, como quem aperta uma tecla só).
    public static ConsoleKeyInfo ReadKey(bool intercept)
    {
        if (Console.In is not LeitorJs)
            throw new InvalidOperationException("Cannot read keys when either application does not have a console or when console input has been redirected. Try Console.Read.");
        int c = Console.In.Read();
        if (c < 0) throw new InvalidOperationException("Cannot read keys when either application does not have a console or when console input has been redirected. Try Console.Read.");
        char ch = (char)c;
        if (ch != '\n') { int r; while ((r = Console.In.Peek()) >= 0 && r != '\n') Console.In.Read(); if (Console.In.Peek() == '\n') Console.In.Read(); }
        ConsoleKey k = ch switch
        {
            '\n' or '\r' => ConsoleKey.Enter,
            ' ' => ConsoleKey.Spacebar,
            '\t' => ConsoleKey.Tab,
            >= 'a' and <= 'z' => ConsoleKey.A + (ch - 'a'),
            >= 'A' and <= 'Z' => ConsoleKey.A + (ch - 'A'),
            >= '0' and <= '9' => ConsoleKey.D0 + (ch - '0'),
            _ => 0,
        };
        if (ch == '\n') ch = '\r';
        return new ConsoleKeyInfo(ch, k, ch is >= 'A' and <= 'Z', false, false);
    }
}
