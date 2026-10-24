using System.Diagnostics;
using System.Globalization;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform.Storage;
using Tonarium.Desktop.Core;

namespace Tonarium.Desktop.Views;

/// <summary>Server-backed profile editing and the native participant action card.</summary>
public sealed class ProfileWindow : Window
{
    private readonly NativeContext context;
    private readonly string name;
    private readonly string userId;
    private readonly bool self;
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(25) };
    private readonly StackPanel body = new() { Spacing = 10 };
    private readonly TextBlock feedback = Ui.Text("", 13, "#2E9A64");
    private readonly TextBlock presence = Ui.Text("", 12, Ui.Muted);
    private readonly Image portrait = new() { Width = 80, Height = 80, Stretch = Stretch.UniformToFill };
    private readonly Image texture = new() { Height = 170, Stretch = Stretch.Uniform };
    private readonly TextBlock avatarHint = Ui.Text("アバター未設定の間は、サンプルの姿で参加します。", 12, Ui.Muted);
    private TextBox? bio;
    private TextBlock? biography;
    private TextBlock? blockedHint;
    private AvatarPortrait? avatarPreview;
    private Button? friendButton, followButton, blockButton;
    private Bitmap? portraitBitmap, textureBitmap;
    private bool requested, closed;
    private string? followLabel;

    public ProfileWindow(NativeContext context, string userIdOrName)
    {
        this.context = context;
        var person = context.State.Users.FirstOrDefault(x => J.Text(x, "id") == userIdOrName || J.Text(x, "name") == userIdOrName);
        name = J.Text(person, "name", userIdOrName).Trim();
        userId = J.Text(person, "id", userIdOrName == context.State.Name ? context.State.SelfId : "");
        self = userId == context.State.SelfId || name == context.State.Name;
        Title = name + " のプロフィール · tonarium";
        Width = self ? 560 : 420; Height = self ? 840 : 530; MinWidth = self ? 470 : 420; MinHeight = 390;
        Background = Ui.Brush(Ui.Paper); FontFamily = Ui.BodyFont;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var root = new DockPanel { Background = Ui.Brush(Ui.Paper) };
        var footer = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), ColumnSpacing = 14, Margin = new Thickness(0, 18, 0, 0) };
        footer.Children.Add(feedback); var close = PlainButton("閉じる", Close); Grid.SetColumn(close, 1); footer.Children.Add(close);
        DockPanel.SetDock(footer, Dock.Bottom); root.Children.Add(footer);
        if (self) root.Margin = new Thickness(24, 20);
        else
        {
            footer.Margin = new Thickness(24, 8, 24, 20);
            var banner = new Grid { Height = 96, Background = BannerBrush() };
            var dismiss = PlainButton("", Close); dismiss.Content = new WebIcon("close", 18);
            dismiss.Width = 36; dismiss.Padding = new Thickness(0); dismiss.HorizontalAlignment = HorizontalAlignment.Right;
            dismiss.VerticalAlignment = VerticalAlignment.Top; dismiss.Margin = new Thickness(12); dismiss.Background = Ui.Brush("#D9FFFFFF");
            banner.Children.Add(dismiss); DockPanel.SetDock(banner, Dock.Top); root.Children.Add(banner);
            body.Margin = new Thickness(24, 0, 24, 0); body.Spacing = 14;
        }
        var scroll = new ScrollViewer { Content = body, HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled };
        if (!self) scroll.Margin = new Thickness(0, -40, 0, 0);
        root.Children.Add(scroll);
        Content = root;
        BuildHeader();
        if (self) BuildEditor(); else BuildParticipant(person);
        Opened += async (_, _) => await RunAsync(LoadAsync);
        context.State.Changed += RefreshActions;
        Closed += (_, _) => { closed = true; context.State.Changed -= RefreshActions; portraitBitmap?.Dispose(); textureBitmap?.Dispose(); http.Dispose(); };
        RefreshActions();
    }

    private void BuildHeader()
    {
        if (self)
        {
            body.Children.Add(Heading(name + " のプロフィール", 20));
            body.Children.Add(Ui.Text("名前ごとにサーバーへ保存され、同じ名前で入ると使われます", 12, Ui.Muted));
            return;
        }
        body.Children.Add(CreateAvatarPreview(128, 144));
        var title = Heading(name, 22);
        var labels = new StackPanel { Spacing = 4, Children = { title, presence } };
        body.Children.Add(labels);
    }

    private Control Face(double size)
    {
        var monogram = Ui.Text(name.Length > 0 ? name[..1] : "と", 32, Ui.Purple);
        monogram.HorizontalAlignment = HorizontalAlignment.Center;
        var imageHost = new Grid { Width = size, Height = size };
        portrait.Width = portrait.Height = size;
        imageHost.Children.Add(monogram); imageHost.Children.Add(portrait);
        return new Border { Child = imageHost, Width = size + 8, Height = size + 8, Background = BannerBrush(), CornerRadius = new CornerRadius(size / 2 + 4), BorderBrush = Ui.Brush(Ui.Paper), BorderThickness = new Thickness(4), ClipToBounds = true, HorizontalAlignment = HorizontalAlignment.Left };
    }

    private void BuildEditor()
    {
        body.Children.Add(Section("音声", ActionButton("マイク・スピーカーの設定", () => context.ShowAudioSettingsAsync(this))));
        bio = new TextBox { PlaceholderText = "プロフィールに表示されます", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MaxLength = 300, MinHeight = 72, Height = 72, FontFamily = Ui.BodyFont, FontSize = 14, CornerRadius = new CornerRadius(12), Padding = new Thickness(12, 10) };
        var count = Ui.Text("0 / 300", 11, Ui.Muted);
        bio.TextChanged += (_, _) => count.Text = $"{bio.Text?.Length ?? 0} / 300";
        var saveRow = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") }; saveRow.Children.Add(count);
        var save = ActionButton("自己紹介を保存", SaveBioAsync); Grid.SetColumn(save, 1); saveRow.Children.Add(save);
        body.Children.Add(Section("自己紹介", bio, saveRow));
        body.Children.Add(Section("アイコン（2D）", Ui.Row(Face(64), ActionButton("画像を選ぶ", () => UploadImageAsync(false)))));
        texture.Source = WebAssets.Image("oekaki/sample.png").Source;
        var upload = ActionButton("画像を選ぶ", () => UploadImageAsync(true)); MakePrimary(upload);
        var images = new Grid { ColumnDefinitions = new ColumnDefinitions("150,*"), ColumnSpacing = 12 };
        var preview = CreateAvatarPreview(150, 170); images.Children.Add(preview);
        var atlas = new Border { Child = new Grid { Children = { new TransparencyGrid(), texture } }, BorderBrush = Ui.Brush("#EEE8DD"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(10), ClipToBounds = true, Height = 170 };
        Grid.SetColumn(atlas, 1); images.Children.Add(atlas);
        body.Children.Add(Section("3D アバター（お絵描きアバター）", images, avatarHint,
            Wrap(upload, ActionButton("manifest.json を選ぶ（任意）", UploadManifestAsync),
                ActionButton("テンプレートをダウンロード", SaveTemplateAsync), PlainButton("oekaki-avatar で描く ↗", () => Launch("https://oekaki-avatar.anthrotech.dev/"))),
            Ui.Text("テンプレート（2048×1024）に描いた画像を 1 枚アップロードします。oekaki-avatar で書き出した texture.png と manifest.json も使えます", 12, Ui.Muted)));
        var values = new[] { 0d, .5, 1, 2, 3 };
        var current = double.TryParse(NativeSettings.GetString("loadScale", "1"), CultureInfo.InvariantCulture, out var n) ? n : 1;
        var segment = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2 }; var choices = new List<(double Value, Button Button)>();
        void ApplySelection() { foreach (var (value, button) in choices) { button.Background = Ui.Brush(value == current ? Ui.Paper : "#00FFFFFF"); button.Foreground = Ui.Brush(value == current ? Ui.Ink : Ui.Muted); button.FontWeight = value == current ? FontWeight.Bold : FontWeight.Normal; } }
        foreach (var value in values)
        {
            var option = PlainButton(value == 0 ? "なし" : "×" + value.ToString(CultureInfo.InvariantCulture), () => { current = value; NativeSettings.SetString("loadScale", value.ToString(CultureInfo.InvariantCulture)); ApplySelection(); });
            option.MinWidth = 58; option.BorderThickness = new Thickness(0); choices.Add((value, option)); segment.Children.Add(option);
        }
        ApplySelection();
        body.Children.Add(Section("2D / 3D 切り替えの読み込み時間", new Border { Child = segment, Background = Ui.Brush("#F3EEE4"), Padding = new Thickness(3), CornerRadius = new CornerRadius(12), HorizontalAlignment = HorizontalAlignment.Left }, Ui.Text("標準（×1）で 1〜2 秒。この端末にだけ保存されます", 12, Ui.Muted)));
    }

    private void BuildParticipant(JsonNode? person)
    {
        biography = Ui.Text(J.Text(person, "bio", "自己紹介はまだありません"), 13, "#3A3942");
        biography.LineHeight = 22;
        biography.Tag = "biography";
        body.Children.Add(biography);
        var near = ActionButton("そばにいく", GoNearAsync);
        near.Content = IconLabel("near", "そばにいく", "#FFFFFF"); MakePrimary(near);
        followButton = ActionButton("ついていく", () => context.Client.SendRoomAsync(new { t = "follow", target = J.Text(context.State.Presence[context.State.SelfId], "follow") == userId ? null : userId }));
        var poke = ActionButton("つんつん", () => context.Client.SendRoomAsync(new { t = "poke", to = userId }));
        poke.Content = IconLabel("poke", "つんつん");
        near.IsEnabled = poke.IsEnabled = context.State.SessionId is not null && J.Text(person, "session") == context.State.SessionId;
        var actions = new Grid { ColumnDefinitions = new ColumnDefinitions("*,*,*"), ColumnSpacing = 8 };
        var actionButtons = new[] { near, followButton, poke };
        for (var i = 0; i < actionButtons.Length; i++)
        {
            var button = actionButtons[i]; button.Height = 44; button.CornerRadius = new CornerRadius(12); button.Padding = new Thickness(6, 0); button.FontSize = 13; button.HorizontalAlignment = HorizontalAlignment.Stretch;
            Grid.SetColumn(button, i); actions.Children.Add(button);
        }
        body.Children.Add(actions);
        friendButton = ActionButton("フレンド申請", async () =>
        {
            var inbound = HasFriendRequest();
            await context.Client.SendAsync(new { t = inbound ? "friendAccept" : "friendRequest", to = userId });
            if (inbound)
                foreach (var notification in context.State.Notifications.OfType<JsonObject>().Where(x => J.Text(x, "t") == "friendRequest" && J.Text(x, "from") == userId).ToArray()) context.State.Notifications.Remove(notification);
            else requested = true;
            feedback.Text = inbound ? "フレンド申請を承認しました" : "フレンド申請を送りました";
            RefreshActions();
        });
        friendButton.IsEnabled = userId.Length > 0;
        var message = PlainButton("メッセージ", () => { context.ShowHome("dm:" + name); Close(); });
        message.Content = IconLabel("chat", "メッセージ");
        message.HorizontalAlignment = HorizontalAlignment.Left;
        body.Children.Add(message);
        blockButton = PlainButton("ブロック", () =>
        {
            var blocked = !NativeSettings.BlockedNames.Contains(name);
            NativeSettings.SetBlocked(name, blocked); context.State.Touch(); RefreshActions();
            feedback.Text = blocked ? "ブロックしました。この端末に保存されます" : "ブロックを解除しました";
        });
        var reason = new TextBox { PlaceholderText = "何があったかを書いてください", MaxLength = 500, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 90 };
        var report = Section("通報の理由", reason, ActionButton("通報を送る", async () =>
        {
            if (string.IsNullOrWhiteSpace(reason.Text)) { feedback.Text = "通報の理由を入力してください"; return; }
            await PostJsonAsync("/report", new JsonObject { ["from"] = context.State.Name, ["target"] = name, ["reason"] = reason.Text.Trim() });
            feedback.Text = "通報を送りました。ありがとうございます"; reason.Text = "";
        }));
        report.IsVisible = false;
        var reportButton = PlainButton("通報", () => report.IsVisible = !report.IsVisible); reportButton.Foreground = Ui.Brush("#A8321F");
        var foot = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto"), ColumnSpacing = 4 };
        friendButton.HorizontalAlignment = HorizontalAlignment.Left;
        foreach (var button in new[] { friendButton, blockButton, reportButton }) { button.FontSize = 12; button.Padding = new Thickness(8, 0); button.BorderThickness = new Thickness(0); button.Background = Brushes.Transparent; }
        foot.Children.Add(friendButton); Grid.SetColumn(blockButton, 1); foot.Children.Add(blockButton); Grid.SetColumn(reportButton, 2); foot.Children.Add(reportButton);
        body.Children.Add(new Border { Child = foot, BorderBrush = Ui.Brush("#EEE8DD"), BorderThickness = new Thickness(0, 1, 0, 0), Padding = new Thickness(0, 12, 0, 0) });
        blockedHint = Ui.Text("ブロック中：この人の声・チャット・通知はあなたに届きません", 12, Ui.Muted);
        body.Children.Add(blockedHint);
        body.Children.Add(report);
    }

    private bool HasFriendRequest() => context.State.Notifications.Any(x => J.Text(x, "t") == "friendRequest" && J.Text(x, "from") == userId);
    private void RefreshActions()
    {
        if (closed || self) return;
        var person = context.State.Users.FirstOrDefault(x => J.Text(x, "id") == userId);
        var isFriend = context.State.Friends.Any(x => J.Value(x) == name);
        var online = person is not null && J.Text(person, "session") != "";
        presence.Text = !online ? "オフライン" : $"{(J.Text(person, "mode") == "3d" ? "3D" : "2D")} で参加中" + (J.Bool(person, "sharing") ? " · 画面共有中" : "") + (!J.Bool(context.State.Presence[userId], "micOn") ? " · ミュート" : "") + (isFriend ? " · フレンド" : "");
        if (online && J.Text(person, "session") == context.State.SessionId)
        {
            var a = ResolvePosition(userId); var b = ResolvePosition(context.State.SelfId); var distance = Math.Sqrt(Math.Pow(a.X - b.X, 2) + Math.Pow(a.Z - b.Z, 2));
            presence.Text += " · " + (distance < 10 ? distance.ToString("0.0", CultureInfo.InvariantCulture) : Math.Round(distance).ToString(CultureInfo.InvariantCulture)) + "m";
        }
        if (friendButton is not null) { friendButton.Content = isFriend ? "✓ フレンド" : HasFriendRequest() ? "フレンド申請を承認" : requested ? "申請しました" : "フレンド申請"; friendButton.IsEnabled = userId.Length > 0 && !isFriend && !requested; }
        if (followButton is not null)
        {
            var label = userId.Length > 0 && J.Text(context.State.Presence[context.State.SelfId], "follow") == userId ? "やめる" : "ついていく";
            if (followLabel != label) { followButton.Content = IconLabel("follow", label); followLabel = label; }
            followButton.IsEnabled = context.State.Mode == "2d" && J.Text(person, "mode") == "3d" && context.State.SessionId is not null && J.Text(person, "session") == context.State.SessionId;
        }
        if (blockButton is not null) blockButton.Content = NativeSettings.BlockedNames.Contains(name) ? "ブロック解除" : "ブロック";
        if (blockedHint is not null) blockedHint.IsVisible = NativeSettings.BlockedNames.Contains(name);
    }

    private async Task LoadAsync()
    {
        var document = JsonNode.Parse(await http.GetStringAsync(Endpoint("/profile")));
        if (closed) return;
        if (bio is not null) bio.Text = J.Text(document, "bio");
        else if (biography is not null) biography.Text = J.Text(document, "bio") is { Length: > 0 } value ? value : "自己紹介はまだありません";
        await Task.WhenAll(LoadImageAsync(false), self ? LoadImageAsync(true) : Task.CompletedTask);
    }

    private async Task LoadImageAsync(bool avatar)
    {
        using var response = await http.GetAsync(Endpoint(avatar ? "/avatar" : "/icon") + "&t=" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        if (closed) return;
        byte[] bytes;
        if (response.IsSuccessStatusCode) bytes = await response.Content.ReadAsByteArrayAsync();
        else if (avatar && response.StatusCode == System.Net.HttpStatusCode.NotFound)
            bytes = await http.GetByteArrayAsync(context.State.ServerUrl.TrimEnd('/') + "/oekaki/sample.png");
        else return;
        if (closed) return;
        using var memory = new MemoryStream(bytes); var image = new Bitmap(memory);
        if (avatar) { texture.Source = image; texture.IsVisible = true; avatarHint.IsVisible = false; textureBitmap?.Dispose(); textureBitmap = image; }
        else { portrait.Source = image; portraitBitmap?.Dispose(); portraitBitmap = image; }
    }

    private async Task SaveBioAsync()
    {
        await PostJsonAsync("/profile", new JsonObject { ["bio"] = bio?.Text ?? "" });
        await ProfileUpdatedAsync(); feedback.Text = "自己紹介を保存しました";
    }

    private async Task UploadImageAsync(bool avatar)
    {
        var files = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions { Title = avatar ? "アバター画像を選ぶ" : "アイコン画像を選ぶ", AllowMultiple = false, FileTypeFilter = [FilePickerFileTypes.ImageAll] });
        if (files.Count == 0) return;
        await using var source = await files[0].OpenReadAsync();
        using var input = new MemoryStream(); await source.CopyToAsync(input); input.Position = 0;
        using var content = new ByteArrayContent(ProfileImage.Encode(input.ToArray(), avatar)); content.Headers.ContentType = new MediaTypeHeaderValue(avatar ? "image/png" : "image/jpeg");
        using var result = await http.PostAsync(Endpoint(avatar ? "/avatar" : "/icon"), content); result.EnsureSuccessStatusCode();
        await ProfileUpdatedAsync(); await LoadImageAsync(avatar); feedback.Text = avatar ? "アバター画像を保存しました" : "アイコンを保存しました";
    }

    private async Task UploadManifestAsync()
    {
        var files = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions { Title = "manifest.json を選ぶ", AllowMultiple = false, FileTypeFilter = [new FilePickerFileType("JSON") { Patterns = ["*.json"], MimeTypes = ["application/json"] }] });
        if (files.Count == 0) return;
        await using var stream = await files[0].OpenReadAsync(); using var reader = new StreamReader(stream);
        var manifest = JsonNode.Parse(await reader.ReadToEndAsync()) as JsonObject ?? throw new IOException("JSON の形式を確認してください。");
        await PostJsonAsync("/avatar/params", manifest["params"] ?? manifest); await ProfileUpdatedAsync(); feedback.Text = "アバターの調整値を保存しました";
    }

    private async Task SaveTemplateAsync()
    {
        var file = await StorageProvider.SaveFilePickerAsync(new FilePickerSaveOptions { Title = "テンプレートを保存", SuggestedFileName = "oekaki-template.png", DefaultExtension = ".png", FileTypeChoices = [FilePickerFileTypes.ImagePng] });
        if (file is null) return;
        var bytes = await http.GetByteArrayAsync(context.State.ServerUrl.TrimEnd('/') + "/oekaki/template.png");
        await using var output = await file.OpenWriteAsync(); output.SetLength(0); await output.WriteAsync(bytes); feedback.Text = "テンプレートを保存しました";
    }

    private async Task GoNearAsync()
    {
        var target = ResolvePosition(userId); var me = ResolvePosition(context.State.SelfId);
        var dx = me.X - target.X; var dz = me.Z - target.Z; var distance = Math.Sqrt(dx * dx + dz * dz);
        if (distance < .01) { dx = 0; dz = 1; } else { dx /= distance; dz /= distance; }
        var x = Math.Clamp(target.X + dx, -9.5, 9.5); var z = Math.Clamp(target.Z + dz, -9.5, 9.5); var ry = Math.Atan2(-(target.X - x), -(target.Z - z));
        if (context.State.Mode == "3d")
        {
            await context.TeleportAsync(x, z, ry);
        }
        else await context.Client.SendRoomAsync(new { t = "place2d", target = context.State.SelfId, pos = new { x, z, ry } });
        feedback.Text = name + " のそばへ移動しました";
    }

    private (double X, double Z) ResolvePosition(string id)
    {
        var users = context.State.Users.Where(x => J.Text(x, "session") == context.State.SessionId).ToArray();
        var places = new Dictionary<string, (double X, double Z, double Yaw)>();
        foreach (var user in users.Where(x => J.Text(x, "mode") == "3d"))
        {
            var key = J.Text(user, "id"); var avatar = context.State.Avatars[key];
            places[key] = (J.Number(avatar, "x"), J.Number(avatar, "z"), J.Number(avatar, "ry"));
        }
        var followers = new Dictionary<string, int>(); var queue = 0;
        foreach (var user in users.Where(x => J.Text(x, "mode") != "3d"))
        {
            var key = J.Text(user, "id"); var presence = context.State.Presence[key]; var followed = J.Text(presence, "follow");
            if (places.TryGetValue(followed, out var target))
            {
                var index = followers.GetValueOrDefault(followed); followers[followed] = index + 1;
                var side = (index % 2 == 1 ? -1 : 1) * Math.Ceiling(index / 2d) * .45; var back = .9 + Math.Floor(index / 3d) * .35;
                places[key] = (target.X + Math.Sin(target.Yaw) * back + Math.Cos(target.Yaw) * side, target.Z + Math.Cos(target.Yaw) * back - Math.Sin(target.Yaw) * side, target.Yaw);
            }
            else if (presence?["pos"] is { } pos) places[key] = (J.Number(pos, "x"), J.Number(pos, "z"), J.Number(pos, "ry"));
            else
            {
                var radius = .45 * Math.Sqrt(queue); var angle = queue++ * 2.39996;
                places[key] = (Math.Sin(angle) * radius, 6.5 + Math.Cos(angle) * radius, 0);
            }
        }
        var place = places.GetValueOrDefault(id, (0, 6.5, 0));
        return (place.Item1, place.Item2);
    }

    private async Task PostJsonAsync(string path, JsonNode payload)
    {
        using var content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");
        using var response = await http.PostAsync(path == "/report" ? context.State.ServerUrl.TrimEnd('/') + path : Endpoint(path), content);
        response.EnsureSuccessStatusCode();
    }
    private async Task ProfileUpdatedAsync() { avatarPreview?.RefreshAvatar(); if (context.State.Connected) await context.Client.SendAsync(new { t = "profileUpdated" }); }
    private string Endpoint(string path) => context.State.ServerUrl.TrimEnd('/') + path + "?name=" + Uri.EscapeDataString(name);
    private Button ActionButton(string label, Func<Task> action) => PlainButton(label, () => _ = RunAsync(action));
    private async Task RunAsync(Func<Task> action)
    {
        try { await action(); }
        catch (Exception ex) { if (!closed) feedback.Text = "操作できませんでした: " + ex.Message; }
    }
    private static Control Section(string title, params Control[] children)
    {
        var header = Ui.Text(title, 13, Ui.Muted); header.FontWeight = FontWeight.Bold;
        var column = new StackPanel { Spacing = 6, Margin = new Thickness(0, 8, 0, 0) }; column.Children.Add(header);
        foreach (var child in children) column.Children.Add(child); return column;
    }
    private Control CreateAvatarPreview(double width, double height)
    {
        avatarPreview = new AvatarPortrait(context, string.IsNullOrEmpty(userId) ? name : userId) { Width = width, Height = height, FullBody = self };
        return new Border { Child = avatarPreview, Width = width, Height = height, Background = Ui.Brush("#F3EEE4"), CornerRadius = new CornerRadius(12), ClipToBounds = true, HorizontalAlignment = HorizontalAlignment.Left };
    }
    private static TextBlock Heading(string text, double size) => new() { Text = text, FontFamily = Ui.HeadingFont, FontSize = size, FontWeight = FontWeight.Bold, Foreground = Ui.Brush(Ui.Ink), TextWrapping = TextWrapping.Wrap };
    private static Button PlainButton(string text, Action action)
    {
        var button = Ui.Button(text, action); button.FontFamily = Ui.BodyFont; button.FontSize = 14; button.Height = 36; button.MinHeight = 36; button.Padding = new Thickness(14, 0); button.Background = Brushes.White; button.BorderBrush = Ui.Brush("#DCD5C8"); return button;
    }
    private static void MakePrimary(Button button) { button.Background = button.BorderBrush = Ui.Brush("#2F5FC4"); button.Foreground = Brushes.White; button.FontWeight = FontWeight.Bold; }
    private static Control IconLabel(string icon, string text, string color = Ui.Ink) => new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6, HorizontalAlignment = HorizontalAlignment.Center, Children = { new WebIcon(icon, 16, Ui.Brush(color)), Ui.Text(text, 13, color) } };
    private static Control Wrap(params Control[] children) { var panel = new WrapPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(-3, 2) }; foreach (var child in children) { child.Margin = new Thickness(3); panel.Children.Add(child); } return panel; }
    private IBrush BannerBrush()
    {
        uint hash = 0; foreach (var c in userId) hash = unchecked(hash * 31 + c);
        var color = HslColor.FromHsl(hash % 360, .65, .55).ToRgb();
        return new SolidColorBrush(color, .35);
    }
    private void Launch(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception ex) { feedback.Text = ex.Message; }
    }

    private sealed class TransparencyGrid : Control
    {
        public override void Render(DrawingContext drawing)
        {
            base.Render(drawing);
            drawing.FillRectangle(Brushes.White, new Rect(Bounds.Size));
            var shade = Ui.Brush("#EFE9DE");
            for (var y = 0; y < Bounds.Height; y += 10)
                for (var x = 0; x < Bounds.Width; x += 10)
                    if ((x / 10 + y / 10) % 2 == 0) drawing.FillRectangle(shade, new Rect(x, y, 10, 10));
        }
    }
}
