using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Presenters;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using Avalonia.VisualTree;
using Tonarium.Desktop.Core;

namespace Tonarium.Desktop.Views;

/// <summary>The native social client. No WebView is used for any of these screens.</summary>
public sealed class HomeView : UserControl
{
    readonly NativeContext _context;
    readonly Action<string>? _pickPage;
    readonly Dictionary<string, string> _drafts = new();
    readonly Dictionary<string, TextBox> _inputs = new();
    readonly Dictionary<string, Button> _nav = new();
    readonly Dictionary<string, Bitmap> _imageCache = new();
    static readonly HttpClient Http = new();
    readonly ContentControl _pageHost = new();
    readonly WrapPanel _groupNav = new() { ItemSpacing = 8, LineSpacing = 8 };
    readonly StackPanel _aside = new() { Spacing = 6 };
    readonly TextBlock _heading = Text("ホーム", 26, weight: FontWeight.Bold);
    readonly ContentControl _headingHost = new();
    readonly ContentControl _actionHost = new();
    readonly TextBlock _self = Text("", 14, weight: FontWeight.SemiBold);
    readonly TextBlock _status = Text("", 11, Muted);
    readonly ContentControl _selfFace = new();
    Button? _mode2d, _mode3d;
    Button? _leave;
    Button? _bell;
    Control? _searchHost;
    TextBox? _searchInput;
    Button? _create;
    ScrollViewer? _asideScroll;
    readonly ScrollViewer _scroll;
    readonly Grid _root;
    readonly Grid _top;
    string _page = "home", _group = "", _channel = "", _dm = "", _tab = "all", _signature = "";
    DateTime _calendarMonth = DateTime.Today;
    DateTime? _pickedDay;
    bool _monthView;
    bool _welcomeHidden;
    bool _includeChangelogMaintenance;
    string _widget = "events";
    string _search = "";
    const string Ink = "#26262E", Muted = "#5E5C64", Paper = "#FFFDF9", Purple = "#5B47A8", Line = "#DCD5C8", Accent = "#2F5FC4", AccentBg = "#EEF3FC", Sand = "#F3EEE4";
    static readonly (string Id, string Label, string Icon)[] Navigation =
    [ ("home", "ホーム", "home"), ("friends", "フレンド", "people"), ("sessions", "セッション", "headset"), ("events", "イベント", "calendar"), ("groups", "グループ", "flag"), ("worlds", "ワールド", "globe"), ("items", "アイテム", "box"), ("changelog", "変更履歴", "calendar") ];
    static readonly (string Id, string Name, string Desc, string Color)[] Worlds =
    [ ("garden", "ガーデン", "木陰のベンチと花壇を散歩できる、空の見える庭", "#DDEBD0"), ("survivors", "宵闇サバイバーズ", "夜明けまで生き残る協力サバイバル", "#E7DDF2"), ("room", "ホール", "何も置いていない広い部屋", "#DCE6F3"), ("cafe", "カフェ", "カウンターとテーブル席のある落ち着いたカフェ", "#F3E6C6"), ("game", "ゲーム", "板わたりサバイバル。ガラスの向こうの 5 層の塔で、最後まで落ちずに残った人が勝ち", "#E7DDF2") ];
    static readonly (string Id, string Name, string Mark, string Desc, string Color)[] Items =
    [ ("note", "付箋", "付", "文字を書いて置いておける付箋。2D ではウィンドウで、3D では空間の板として読み書きできる。", "#FBF1C4"), ("hammer", "ピコピコハンマー", "槌", "手に持って誰かを叩ける。叩くと相手の前に移動する。", "#FBE3D2"), ("chess", "チェス", "♟", "3D では立体のチェス盤、2D ではパネルの UI で遊べる。", "#E3E7F6"), ("chessAi", "チェスAI", "♟AI", "白はあなた、黒はAI。みんなで白の駒を動かしてAIと対戦できる。", "#DFEEE8"), ("g2048", "2048", "2048", "みんなで操作するパズル。3D では互換表示のパネルになる。", "#F4EBCF"), ("canvas", "キャンバス", "画", "みんなで絵を描ける。ペンと消しゴム付き。", "#F6E4EC"), ("camera", "カメラ", "写", "3D 空間で写真を撮ったりライブ配信したりできる。ライブは 2D からも見られる。", "#E5F0E9"), ("dice", "サイコロ", "賽", "TRPG 用のサイコロ（d4〜d100、最大10個）。3D では木の器の中を転がり、結果はチャットに残る。シークレットで振ると結果は自分だけに見える。", "#F3E6D3") ];

    public HomeView(NativeContext context) : this(context, null) { }

    internal HomeView(NativeContext context, Action<string>? pickPage)
    {
        _context = context;
        _pickPage = pickPage;
        FontFamily=Ui.BodyFont;
        _heading.FontFamily=Ui.HeadingFont;
        if (pickPage is not null)
        {
            _root = new Grid(); _top = new Grid(); _scroll = new ScrollViewer();
            Content = BuildSidebar(); Refresh(); return;
        }
        _root = new Grid { ColumnDefinitions = new ColumnDefinitions("228,*,300"), Margin = new Thickness(16), ColumnSpacing = 16 };
        _root.Children.Add(BuildSidebar());
        var center = new Grid { RowDefinitions = new RowDefinitions("Auto,*"), RowSpacing = 22,Margin=new Thickness(4,8) };
        Grid.SetColumn(center, 1);
        var top = _top = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto,Auto"),RowDefinitions=new RowDefinitions("Auto,Auto"), ColumnSpacing = 12,MinHeight=44 };
        _headingHost.Content=_heading;top.Children.Add(_headingHost);
        var search = _searchInput = new TextBox { PlaceholderText = "フレンド・ワールド・グループを検索", Background = Brushes.Transparent,BorderThickness=default, FontSize = 13, MinHeight = 38,Padding=new Thickness(0,6),MinWidth=0 };
        search.TextChanged += (_, _) => { _search = search.Text ?? ""; RenderPage(); };
        var searchRow=new Grid{ColumnDefinitions=new ColumnDefinitions("Auto,*"),ColumnSpacing=8};searchRow.Children.Add(Icon("search",16,Muted));Grid.SetColumn(search,1);searchRow.Children.Add(search);
        _searchHost=new Border{Background=Brush(Paper),CornerRadius=new CornerRadius(999),BorderBrush=Brush(Line),BorderThickness=new Thickness(1),Padding=new Thickness(14,0),Height=40,MaxWidth=300,HorizontalAlignment=HorizontalAlignment.Right,Child=searchRow};
        Grid.SetColumn(_searchHost, 1); top.Children.Add(_searchHost);
        _bell = IconButton("bell", "通知", () => ShowNotifications(),18);_bell.Width=40;_bell.Height=40;_bell.CornerRadius=new CornerRadius(999);_bell.Background=Brush(Paper); Grid.SetColumn(_bell, 2); top.Children.Add(_bell);
        _create=IconTextButton("plus","セッションを作る",()=>CreateSession());_create.Background=Brush(Ink);_create.Foreground=Brush("#FFFFFF");_create.Content=IconLabel("plus","セッションを作る",16,"#FFFFFF");_create.Height=40;_create.CornerRadius=new CornerRadius(12);_actionHost.Content=_create;Grid.SetColumn(_actionHost,3);top.Children.Add(_actionHost);
        center.Children.Add(top);
        _scroll = new ScrollViewer { Content = _pageHost, HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled };
        Grid.SetRow(_scroll, 1); center.Children.Add(_scroll); _root.Children.Add(center);
        _asideScroll = new ScrollViewer { Content = new Border{Child=_aside,Background=Brush(Paper),CornerRadius=new CornerRadius(20),Padding=new Thickness(16),BoxShadow=WebShadow}, HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,VerticalAlignment=VerticalAlignment.Top };
        Grid.SetColumn(_asideScroll, 2); _root.Children.Add(_asideScroll);
        var layers=new Grid();layers.Children.Add(new HomeGround());layers.Children.Add(_root);Content=layers;
        SizeChanged += (_, _) => UpdateColumns();
        Refresh();
    }

    Control BuildSidebar()
    {
        var body = new Grid { RowDefinitions = new RowDefinitions("Auto,*,Auto") };
        var brand = Row(BrandMark(), Text("トナリウム", 16, weight: FontWeight.Bold)); brand.Spacing=10;brand.Margin = new Thickness(8, 6, 8, 14); body.Children.Add(brand);
        var links = Col(2);
        foreach (var (id, label, icon) in Navigation) { var b = IconTextButton(icon,label, () => Navigate(id),18); b.HorizontalContentAlignment = HorizontalAlignment.Left; b.HorizontalAlignment = HorizontalAlignment.Stretch; b.Height = 40;b.FontSize=14;b.FontWeight=FontWeight.SemiBold;b.Padding=new Thickness(12,0);b.CornerRadius=new CornerRadius(12); b.Background = Brushes.Transparent;b.BorderThickness=default; links.Children.Add(b); _nav[id] = b; }
        var groups = Col(8); groups.Margin = new Thickness(8, 14, 8, 0); groups.Children.Add(new Border{Height=1,Background=Brush("#EEE8DD"),Margin=new Thickness(0,0,0,4)});groups.Children.Add(Text("所属グループ", 12, Muted, FontWeight.Bold)); groups.Children.Add(_groupNav);
        var navigationScroll = new ScrollViewer
        {
            Content = Col(0, links, groups),
            HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
            VerticalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Auto
        };
        Grid.SetRow(navigationScroll, 1); body.Children.Add(navigationScroll);
        var bottom = Col(8); bottom.Margin = new Thickness(0, 12, 0, 0);
        var audioSettings=IconTextButton("mic","音声設定",()=>Run(()=>_context.ShowAudioSettingsAsync()),16);audioSettings.HorizontalAlignment=HorizontalAlignment.Stretch;audioSettings.HorizontalContentAlignment=HorizontalAlignment.Left;audioSettings.Background=Brushes.Transparent;audioSettings.BorderThickness=default;bottom.Children.Add(audioSettings);
        bottom.Children.Add(new Border{Height=1,Background=Brush("#EEE8DD"),Margin=new Thickness(8,0,8,4)});bottom.Children.Add(Text("クライアントモード", 12, Muted,FontWeight.Bold));
        _mode2d=IconTextButton("flat","2D", () => Run(() => _context.ChangeModeAsync("2d")),14);_mode3d=IconTextButton("cube","3D", () => Run(() => _context.ChangeModeAsync("3d")),14);var vr=IconTextButton("vr","VR",()=>_context.Notify("VR は準備中です"),14);
        var segment=new Grid{ColumnDefinitions=new ColumnDefinitions("*,*,*"),ColumnSpacing=2};var modes=new[]{_mode2d,_mode3d,vr};for(var i=0;i<3;i++){modes[i].Height=32;modes[i].Padding=default;modes[i].CornerRadius=new CornerRadius(999);modes[i].BorderThickness=default;modes[i].HorizontalAlignment=HorizontalAlignment.Stretch;Grid.SetColumn(modes[i],i);segment.Children.Add(modes[i]);}bottom.Children.Add(new Border{Background=Brush("#1426262E"),CornerRadius=new CornerRadius(999),Padding=new Thickness(3),Child=segment,Margin=new Thickness(0,0,0,6)});
        _selfFace.Content=Mark("", "#DAE5D6", 36);var selfButton=Btn("",StatusDialog);selfButton.Content=Row(_selfFace,Col(2,_self,_status));selfButton.Height=double.NaN;selfButton.MinHeight=44;selfButton.Background=Brushes.Transparent;selfButton.BorderThickness=default;selfButton.Padding=new Thickness(4);selfButton.HorizontalContentAlignment=HorizontalAlignment.Left;var selfRow=new Grid{ColumnDefinitions=new ColumnDefinitions("*,Auto")};selfRow.Children.Add(selfButton);var settings=IconButton("settings","プロフィールを設定",()=>_context.OpenProfile(_context.State.Name),18);Grid.SetColumn(settings,1);selfRow.Children.Add(settings);bottom.Children.Add(new Border{Background=Brush(Sand),CornerRadius=new CornerRadius(14),Padding=new Thickness(6,6,4,6),Child=selfRow});
        ToolTip.SetTip(selfButton,"ステータスを変える");
        Avalonia.Automation.AutomationProperties.SetName(selfButton,"ステータスを変える");
        _leave=IconTextButton("leave","セッションから離脱",()=>Run(()=>_context.Client.LeaveAsync()),18);
        _leave.HorizontalAlignment=HorizontalAlignment.Stretch;_leave.HorizontalContentAlignment=HorizontalAlignment.Left;
        _leave.Background=Brushes.Transparent;_leave.BorderThickness=default;_leave.Foreground=Brush("#A8321F");
        _leave.Content=IconLabel("leave","セッションから離脱",18,"#A8321F",13);bottom.Children.Insert(bottom.Children.Count-1,_leave);
        Grid.SetRow(bottom, 2); body.Children.Add(bottom);
        return new Border { Background = Brush(Paper), CornerRadius = new CornerRadius(20), Padding = new Thickness(16), Child = body,BoxShadow=WebShadow };
    }

    public void Navigate(string page)
    {
        if (_pickPage is not null) { _pickPage(page); return; }
        _context.HomeRoute = page == "group" && _group.Length > 0 ? "group:" + _group : page;
        if (page.StartsWith("dm:")) { _dm = page[3..]; page = "friends"; _tab = "all"; }
        if (page.StartsWith("group:")) { _group = page[6..]; _channel = ""; page = "group"; }
        _page = page;
        if (page == "changelog" && ChangelogCatalog.Latest.Length > 0) NativeSettings.SetString(ChangelogCatalog.SeenKey, ChangelogCatalog.Latest);
        _scroll.Offset = default; RenderPage();
    }
    public void Refresh()
    {
        var s = _context.State;
        _self.Text = s.Name;
        var self=UserByName(s.Name);var statusText=T(self,"statusText");
        _status.Text = s.Connected ? "● " + (statusText.Length>0?statusText:StatusName(T(self,"status","online"))) : "○ 接続待ち";
        if(_bell!=null){var bell=new Grid();bell.Children.Add(Icon("bell",18));if(s.Notifications.Any(n=>B(n,"unread")))bell.Children.Add(new Border{Width=8,Height=8,CornerRadius=new CornerRadius(4),Background=Brush("#C2402F"),HorizontalAlignment=HorizontalAlignment.Right,VerticalAlignment=VerticalAlignment.Top});_bell.Content=bell;}
        if(_mode2d!=null){_mode2d.Background=s.Mode=="2d"?Brush("#FFFFFF"):Brushes.Transparent;_mode2d.Content=IconLabel("flat","2D",14,s.Mode=="2d"?Accent:Muted,12);}if(_mode3d!=null){_mode3d.Background=s.Mode=="3d"?Brush("#FFFFFF"):Brushes.Transparent;_mode3d.Content=IconLabel("cube","3D",14,s.Mode=="3d"?Accent:Muted,12);}
        if(_leave!=null)_leave.IsVisible=s.SessionId is not null;
        RefreshNavigation();
        // Room position packets arrive frequently. They must never rebuild text inputs.
        var signature = string.Join("|", _context.HomeRoute, s.Name, s.SessionId, s.Sessions.ToJsonString(), s.Groups.ToJsonString(), s.Events.ToJsonString(), s.Friends.ToJsonString(), s.People.ToJsonString(), s.Conversations.ToJsonString(), s.Reads.ToJsonString(), s.Notifications.ToJsonString(), s.SessionInfo.ToJsonString(), string.Join(";", s.Users.Select(u => $"{T(u,"id")}:{T(u,"name")}:{T(u,"session")}:{T(u,"status")}:{T(u,"statusText")}:{T(u,"icon")}")));
        if (signature == _signature) return;
        _signature = signature;
        _selfFace.Content=Face(s.Name,34);
        _groupNav.Children.Clear();
        foreach (var g in s.Groups.Where(IsMember))
        {
            var id=T(g,"id");var unread=UnreadConversations().Any(c=>c.StartsWith("ch:"+id+":"));
            var b=Btn("",()=>Navigate("group:"+id));b.Width=40;b.Height=40;b.CornerRadius=new CornerRadius(12);b.Padding=default;
            b.Background=Brush(T(g,"color",Accent));b.BorderBrush=Brush(Accent);b.BorderThickness=new Thickness(_context.HomeRoute=="group:"+id?2:0);
            var mark=new Grid();mark.Children.Add(Text(Initial(T(g,"name")),16,"#FFFFFF",FontWeight.Bold));
            ((TextBlock)mark.Children[0]).HorizontalAlignment=HorizontalAlignment.Center;
            if(unread)mark.Children.Add(new Border{Width=8,Height=8,Background=Brush("#C2402F"),CornerRadius=new CornerRadius(4),HorizontalAlignment=HorizontalAlignment.Right,VerticalAlignment=VerticalAlignment.Top});
            b.Content=mark;ToolTip.SetTip(b,T(g,"name"));Avalonia.Automation.AutomationProperties.SetName(b,T(g,"name")+(unread?"（未読あり）":""));_groupNav.Children.Add(b);
        }
        if (_groupNav.Children.Count == 0) _groupNav.Children.Add(Text("なし", 12, Muted));
        if (_pickPage is null) { RenderPage(); RenderAside(); }
    }

    void RefreshNavigation()
    {
        var unreadDm=UnreadConversations().Count(c=>c.StartsWith("dm:"));
        var online=_context.State.Users.Where(u=>FriendNames.Contains(T(u,"name"))).Select(u=>T(u,"name")).Distinct().Count();
        var now=DateTimeOffset.Now.ToUnixTimeMilliseconds();
        var upcoming=_context.State.Events.Count(e=>N(e,"at")>now-3600000&&N(e,"at")<now+7*86400000L);
        var route=_context.HomeRoute.StartsWith("dm:")?"friends":_context.HomeRoute;
        foreach(var n in Navigation)
        {
            var b=_nav[n.Id];var selected=n.Id==route;b.Background=selected?Brush(AccentBg):Brushes.Transparent;
            var row=new Grid{ColumnDefinitions=new ColumnDefinitions("*,Auto"),ColumnSpacing=6};
            row.Children.Add(IconLabel(n.Icon,n.Label,18,selected?Accent:"#3A3942",14,12));
            var count=n.Id=="friends"?(unreadDm>0?unreadDm:online):n.Id=="events"?upcoming:0;
            if(count>0){var badge=Chip(count.ToString(),n.Id=="friends"&&unreadDm>0?"#C2402F":"#E6EAF2",n.Id=="friends"&&unreadDm>0?"#FFFFFF":Accent,11,20);Grid.SetColumn(badge,1);row.Children.Add(badge);}
            if(n.Id=="changelog" && ChangelogCatalog.Unread){var dot=new Border{Width=8,Height=8,CornerRadius=new CornerRadius(4),Background=Brush("#C2402F"),VerticalAlignment=VerticalAlignment.Center};Grid.SetColumn(dot,1);row.Children.Add(dot);}
            b.Content=row;b.HorizontalContentAlignment=HorizontalAlignment.Stretch;
            Avalonia.Automation.AutomationProperties.SetName(b,n.Label);
        }
    }

    void RenderPage()
    {
        var focused = TopLevel.GetTopLevel(this)?.FocusManager?.GetFocusedElement() as TextBox;
        var focusKey = _inputs.FirstOrDefault(x => x.Value == focused).Key;
        var caret = focused?.CaretIndex ?? 0;
        var offset = _scroll.Offset; _inputs.Clear();
        RefreshNavigation();
        if(_searchHost!=null)_searchHost.IsVisible=_page!="group";UpdateColumns();
        if(_searchInput!=null){_searchInput.PlaceholderText=_page=="changelog"?"見出し・本文を検索":"フレンド・ワールド・グループを検索";Avalonia.Automation.AutomationProperties.SetName(_searchInput,_page=="changelog"?"変更履歴を検索":"コンテンツを検索");}
        _heading.Text = Navigation.FirstOrDefault(n => n.Id == _page).Label ?? (_page == "group" ? T(Find(_context.State.Groups, _group), "name", "グループ") : "通知");
        _headingHost.Content=null;_actionHost.Content=null;
        if(_page=="group"&&Find(_context.State.Groups,_group) is { } headerGroup){var mark=(Border)Mark(Initial(T(headerGroup,"name")),T(headerGroup,"color",Accent),48);((TextBlock)mark.Child!).Foreground=Brush("#FFFFFF");_headingHost.Content=Row(mark,Col(2,Heading(T(headerGroup,"name"),22),Text($"{A(headerGroup,"members").Count} 人 · セッション {_context.State.Sessions.Count(s=>T(s,"group")==_group)} 件 · {T(headerGroup,"owner")} が作成",12,Muted)));_actionHost.Content=GroupHeaderActions(headerGroup);}else{_headingHost.Content=_heading;_actionHost.Content=_create;}
        _pageHost.Content = _page switch
        {
            "friends" => FriendsPage(), "sessions" => SessionsPage(), "groups" => GroupsPage(), "group" => GroupPage(), "events" => EventsPage(), "worlds" => WorldsPage(), "items" => ItemsPage(), "changelog" => ChangelogPage(), "notifications" => NotificationsPage(), _ => Dashboard()
        };
        Dispatcher.UIThread.Post(() => { _scroll.Offset = offset; if (focusKey != null && _inputs.TryGetValue(focusKey, out var replacement)) { replacement.Focus(); replacement.CaretIndex = Math.Min(caret, replacement.Text?.Length ?? 0); } });
    }

    Control ChangelogPage()
    {
        var root = Col(12);
        var includeMaintenance = new CheckBox { Content = "開発・保守を含める", IsChecked = _includeChangelogMaintenance };
        includeMaintenance.IsCheckedChanged += (_, _) => { _includeChangelogMaintenance = includeMaintenance.IsChecked == true; RenderPage(); };
        root.Children.Add(includeMaintenance);
        var entries = ChangelogCatalog.Entries.Where(e => (_includeChangelogMaintenance || T(e,"tag") != "開発・保守") &&
            (T(e,"title").Contains(_search,StringComparison.OrdinalIgnoreCase) || A(e,"items").Any(i => (i?.GetValue<string>() ?? "").Contains(_search,StringComparison.OrdinalIgnoreCase)))).ToArray();
        foreach (var entry in entries)
        {
            var body = Col(12,Text(T(entry,"date"),12,Muted),Row(Heading(T(entry,"title"),17),Text(T(entry,"tag"),12,Muted)));
            foreach (var item in A(entry,"items")) body.Children.Add(Text("• " + item?.GetValue<string>(),14));
            root.Children.Add(Card(body));
        }
        if (entries.Length == 0) root.Children.Add(Empty("該当する変更履歴はありません"));
        return root;
    }

    Control Dashboard()
    {
        var s=_context.State;var col=Col(22);
        if(string.IsNullOrWhiteSpace(_search))
        {
            var unread=UnreadConversations().ToArray();
            if(s.LastSeen.HasValue&&!_welcomeHidden)
            {
                var recaps=s.Conversations.SelectMany(pair=>(pair.Value as JsonArray??new()).Where(m=>m?["recap"] is JsonObject&&N(m,"at")>s.LastSeen.Value).Select(m=>(pair.Key,m))).ToArray();
                var plans=s.Conversations.SelectMany(pair=>(pair.Value as JsonArray??new()).Where(m=>m?["plan"] is JsonObject plan&&N(plan,"at")>DateTimeOffset.Now.ToUnixTimeMilliseconds()&&plan["event"]==null&&(plan["answers"] as JsonObject)?[s.Name]==null).Select(m=>(pair.Key,m))).ToArray();
                var newEvents=s.Events.Where(e=>N(e,"at")>DateTimeOffset.Now.ToUnixTimeMilliseconds()&&A(e,"attendees").Count>0&&!new[]{"attendees","maybe","declined"}.Any(k=>A(e,k).Any(n=>n?.GetValue<string>()==s.Name))&&s.Groups.Any(g=>T(g,"id")==T(e,"group")&&IsMember(g))).ToArray();
                if(unread.Length+recaps.Length+plans.Length+newEvents.Length>0)
                {
                    var welcome=Col(12);var hours=Math.Max(1,(int)Math.Round((DateTimeOffset.Now.ToUnixTimeMilliseconds()-s.LastSeen.Value)/3600000d));
                    var title=Row(Heading("おかえりなさい",17),Text((hours<48?$"{hours} 時間ぶり":$"{Math.Round(hours/24d)} 日ぶり")+"。いない間に：",12,Muted));
                    title.Children.Add(SmallButton("既読にする",()=>{foreach(var key in unread){var last=N((s.Conversations[key] as JsonArray)?.LastOrDefault(),"at");Send(new{t="read",conv=key,at=last});} _welcomeHidden=true;RenderPage();}));welcome.Children.Add(title);
                    var notices=new HomeCardGrid(200,10);
                    if(unread.Length>0)notices.Children.Add(SummaryTile("chat",$"未読のメッセージ {unread.Length} 件",string.Join("・",unread.Take(3).Select(ConversationTitle)),()=>OpenConversation(unread[0]),"#EEEAF8"));
                    if(recaps.Length>0)notices.Children.Add(SummaryTile("headset",$"セッションのまとめ {recaps.Length} 件",T(recaps[^1].m?["recap"],"sessionName"),()=>OpenConversation(recaps[^1].Key),Sand));
                    if(plans.Length>0)notices.Children.Add(SummaryTile("calendar",$"日程の相談 {plans.Length} 件",T(plans[0].m,"text","集まり")+" · "+TimeLabel(N(plans[0].m?["plan"],"at")),()=>OpenConversation(plans[0].Key),AccentBg));
                    if(newEvents.Length>0)notices.Children.Add(SummaryTile("calendar",$"返事していないイベント {newEvents.Length} 件",T(newEvents[0],"title")+" · "+TimeLabel(N(newEvents[0],"at")),()=>Navigate("events"),AccentBg));
                    welcome.Children.Add(notices);col.Children.Add(Card(welcome));
                }
            }
            if(unread.Length>0)
            {
                var section=Col(12,Section("未読のメッセージ","DM とグループのチャンネルから"));var cards=new HomeCardGrid(380,12);
                foreach(var key in unread.Take(4))
                {
                    var messages=(s.Conversations[key] as JsonArray??new()).Where(m=>N(m,"at")>N(s.Reads,key)&&T(m,"from")!=s.Name).ToArray();var last=messages.Last();
                    var body=Col(8,Text(ConversationTitle(key),12,Muted,FontWeight.Bold));body.Children.Add(Row(Face(T(last,"from"),32),Col(6,Row(Text(T(last,"from"),13,weight:FontWeight.Bold),Text(TimeLabel(N(last,"at")),12,Muted)),Text(T(last,"text"),13))));
                    if(last?["voice"] is JsonObject voice)body.Children.Add(IconTextButton("play","音声メッセージ",()=>HomeVoiceMessage.Play(_context,T(voice,"url"))));
                    if(last?["media"] is JsonObject media)body.Children.Add(T(media,"kind")=="image"?new ChatMediaPreview(_context,T(media,"url")):IconTextButton("play","動画",()=>OpenUrl(T(media,"url"))));
                    var reply=SmallButton(key.StartsWith("dm:")?"返信":"開く",()=>OpenConversation(key));reply.HorizontalAlignment=HorizontalAlignment.Right;body.Children.Add(reply);cards.Children.Add(new Border{Background=Brush(Paper),BorderBrush=Brush(Line),BorderThickness=new Thickness(1),CornerRadius=new CornerRadius(16),Padding=new Thickness(14,12),Child=body});
                }
                section.Children.Add(cards);col.Children.Add(section);
            }
        }
        var sorted=SortedSessions().Where(x=>Match(T(x,"name"),T(x,"topic"))).ToArray();
        var sessions=Col(12,Section("フレンドの今","参加できるセッションを、フレンドが多い順に"));
        sessions.Children.Add(sorted.Length>0?SessionGrid(sorted):Empty("参加できるセッションがありません"));col.Children.Add(sessions);
        var online=s.Users.Where(u=>T(u,"name")!=s.Name&&FriendNames.Contains(T(u,"name"))).DistinctBy(u=>T(u,"name")).ToArray();
        var idle=online.Where(u=>!s.Sessions.Any(room=>T(room,"id")==T(u,"session"))&&Match(T(u,"name"))).ToArray();
        var friends=Col(12,Section("オンラインのフレンド","参加できるセッションにいないフレンド",()=>Navigate("friends"),"すべて"));
        if(idle.Length==0)friends.Children.Add(Empty(online.Length>0?"みんなセッションにいます":"オンラインのフレンドはいません"));
        else{var grid=new HomeCardGrid(280,12);foreach(var friend in idle)grid.Children.Add(FriendRow(friend));friends.Children.Add(grid);}col.Children.Add(friends);
        return col;
    }
    IEnumerable<string> UnreadConversations()=>_context.State.Conversations.Where(p=>(p.Value as JsonArray??new()).Any(m=>T(m,"from")!=_context.State.Name&&N(m,"at")>N(_context.State.Reads,p.Key))).OrderByDescending(p=>N((p.Value as JsonArray)?.LastOrDefault(),"at")).Select(p=>p.Key);
    IEnumerable<JsonNode?> SortedSessions()=>_context.State.Sessions.OrderByDescending(s=>_context.State.Users.Any(u=>T(u,"session")==T(s,"id")&&FriendNames.Contains(T(u,"name"))&&T(u,"status")=="joinMe")).ThenByDescending(s=>_context.State.Users.Count(u=>T(u,"session")==T(s,"id")&&FriendNames.Contains(T(u,"name")))).ThenByDescending(s=>_context.State.Users.Count(u=>T(u,"session")==T(s,"id")));
    Control SummaryTile(string icon,string title,string subtitle,Action action,string color){var b=Btn("",action);b.Background=Brush(color);b.BorderThickness=default;b.Padding=new Thickness(14,10);b.Height=double.NaN;b.HorizontalContentAlignment=HorizontalAlignment.Left;b.Content=Row(new Border{Width=34,Height=34,CornerRadius=new CornerRadius(10),Background=Brush(icon=="chat"?Purple:icon=="calendar"?Accent:Ink),Child=Icon(icon,16,"#FFFFFF")},Col(4,Text(title,14,weight:FontWeight.Bold),Text(subtitle,12,Muted)));return b;}
    Control CurrentSession()
    {
        var s=_context.State;var session=Find(s.Sessions,s.SessionId??"");var here=s.Users.Where(u=>T(u,"session")==s.SessionId).ToArray();var row=new WrapPanel{ItemSpacing=12,LineSpacing=8};row.Children.Add(HereBadge());row.Children.Add(Col(2,Text(T(session,"name","セッション"),14,weight:FontWeight.Bold),Text($"ワールド：{WorldName(s.World)} · {here.Length} 人",12,Muted)));foreach(var u in here.Take(5))row.Children.Add(Face(T(u,"name"),24));if(_page=="sessions")row.Children.Add(IconTextButton("globe","ワールドを切り替える",()=>Navigate("worlds"),14));var leave=IconTextButton("leave","離脱",()=>Run(()=>_context.Client.LeaveAsync()),14);leave.Foreground=Brush("#A8321F");row.Children.Add(leave);var card=Card(row);card.Padding=new Thickness(16,12);return card;
    }
    Control SessionsPage() { var c=Col(12);if(_context.State.SessionId!=null)c.Children.Add(CurrentSession());c.Children.Add(Section("参加できるセッション",$"{_context.State.Sessions.Count} 件"));var list=_context.State.Sessions.Where(x=>Match(T(x,"name"),T(x,"topic"))).ToArray();c.Children.Add(list.Length>0?SessionGrid(list,true):Empty("見つかりません"));return c; }
    Control SessionGrid(IEnumerable<JsonNode?> sessions,bool showDelete=false)
    {
        var grid = new HomeCardGrid(260,14);
        foreach (var session in sessions) if (session != null) grid.Children.Add(SessionCard(session,showDelete));
        return grid;
    }
    Control SessionCard(JsonNode s,bool showDelete=false)
    {
        var id=T(s,"id");var world=T(_context.State.SessionInfo[id],"world",T(s,"world","room"));
        var here=_context.State.Users.Where(u=>T(u,"session")==id).DistinctBy(u=>T(u,"name")).ToArray();
        var friends=here.Where(u=>FriendNames.Contains(T(u,"name"))).ToArray();var shown=friends.Concat(here.Except(friends)).Take(6).ToArray();
        var header=new Grid{ColumnDefinitions=new ColumnDefinitions("Auto,Auto,*,Auto,Auto"),ColumnSpacing=6,MinHeight=36,Margin=new Thickness(12,10)};
        header.Children.Add(Chip($"{here.Length} 人",Ink,"#FFFFFF",12,20));
        if(here.Any(u=>B(u,"sharing"))){var live=Chip("画面共有","#FBE8E4","#D9483B",11,20,"screen");Grid.SetColumn(live,1);header.Children.Add(live);}
        var worldLabel=IconLabel("globe",WorldName(world),13,"#4A4852",12);Grid.SetColumn(worldLabel,3);header.Children.Add(worldLabel);
        Control join;if(_context.State.SessionId==id)join=HereBadge();else{var button=Btn(_context.State.SessionId==null?"参加する":"移動する",()=>Run(()=>_context.Client.JoinAsync(id)),true);button.Height=32;button.Padding=new Thickness(14,0);button.FontSize=13;join=button;}Grid.SetColumn(join,4);header.Children.Add(join);
        var stack=Col(0,new Border{Background=Brush(Worlds.FirstOrDefault(w=>w.Id==world).Color??Worlds[0].Color),Child=header});
        var body=Col(6);body.Margin=new Thickness(14,12,14,14);
        var title=new Grid{ColumnDefinitions=new ColumnDefinitions("*,Auto"),ColumnSpacing=8};var heading=Heading(T(s,"name"),15);heading.TextWrapping=TextWrapping.NoWrap;heading.TextTrimming=TextTrimming.CharacterEllipsis;title.Children.Add(heading);
        var visibility=T(s,"visibility","public");var group=Find(_context.State.Groups,T(s,"group"));var label=visibility is "group" or "groupPlus"&&group!=null?T(group,"name")+(visibility=="groupPlus"?"＋":""):VisibilityName(visibility);var (background,foreground,icon)=visibility switch{"friends"=>(AccentBg,Accent,"people"),"group" or "groupPlus"=>("#FBE9D7","#A24A16","flag"),"invite"=>("#EEEAF8",Purple,"send"),_=>("#E3F2E8","#2E6E4E","globe")};var visibilityChip=Chip(label,background,foreground,11,22,icon);Grid.SetColumn(visibilityChip,1);title.Children.Add(visibilityChip);body.Children.Add(title);
        body.Children.Add(Text(T(s,"topic","ワールド："+WorldName(world)),12,Muted));
        if(T(s,"owner") is {Length:>0} owner&&owner!=_context.State.Name&&A(s,"invited").Any(n=>n?.GetValue<string>()==_context.State.Name))body.Children.Add(Text(owner+" から招待されています",12,Purple,FontWeight.SemiBold));
        var people=Col(6);people.Margin=new Thickness(0,4,0,0);people.Children.Add(Text(friends.Length>0?$"フレンド {friends.Length} 人":here.Length>0?$"{here.Length} 人がいます":"だれもいません",12,friends.Length>0?Accent:"#4A4852",FontWeight.Bold));
        if(shown.Length>0){var faces=new Grid{ColumnDefinitions=new ColumnDefinitions("*,*"),RowDefinitions=new RowDefinitions(string.Join(',',Enumerable.Repeat("Auto",(shown.Length+1)/2))),ColumnSpacing=10,RowSpacing=4};for(var i=0;i<shown.Length;i++){var u=shown[i];var face=new Grid{ColumnDefinitions=new ColumnDefinitions("22,*,Auto"),ColumnSpacing=6};face.Children.Add(Face(T(u,"name"),22));var name=Text(T(u,"name"),13);name.TextWrapping=TextWrapping.NoWrap;name.TextTrimming=TextTrimming.CharacterEllipsis;Grid.SetColumn(name,1);face.Children.Add(name);var mode=Icon(B(u,"sharing")?"screen":T(u,"mode")=="3d"?"cube":"flat",13,B(u,"sharing")?"#D9483B":Muted);Grid.SetColumn(mode,2);face.Children.Add(mode);Grid.SetColumn(face,i%2);Grid.SetRow(face,i/2);faces.Children.Add(face);}people.Children.Add(faces);if(here.Length>shown.Length)people.Children.Add(Text($"ほか {here.Length-shown.Length} 人",12,Accent,FontWeight.SemiBold));}body.Children.Add(people);
        var remaining=A(_context.State.SessionInfo[id],"items").Select(n=>T(n,"summary")).Distinct().Take(3).ToArray();var nextEvent=_context.State.Events.FirstOrDefault(e=>T(e,"session")==id&&N(e,"at")>DateTimeOffset.Now.AddHours(-1).ToUnixTimeMilliseconds());if(remaining.Length>0||nextEvent!=null){var chips=new WrapPanel{ItemSpacing=6,LineSpacing=6,Margin=new Thickness(0,3,0,0)};if(nextEvent!=null)chips.Children.Add(Chip(TimeLabel(N(nextEvent,"at"))+" "+T(nextEvent,"title"),AccentBg,Accent));foreach(var summary in remaining)chips.Children.Add(Chip(summary));body.Children.Add(chips);}
        if(showDelete&&T(s,"owner")==_context.State.Name){var delete=IconTextButton("trash","消す",()=>Confirm("セッションを削除","このセッションを削除しますか？",()=>Send(new{t="sessionDelete",id})),13);delete.IsEnabled=here.Length==0;delete.Height=26;delete.FontSize=12;delete.Padding=new Thickness(8,0);delete.BorderThickness=default;delete.Background=Brushes.Transparent;delete.HorizontalAlignment=HorizontalAlignment.Right;body.Children.Add(delete);}
        stack.Children.Add(body);return new Border{Background=Brush(Paper),CornerRadius=new CornerRadius(18),ClipToBounds=true,Child=stack,BoxShadow=WebShadow};
    }
    Control FriendsPage()
    {
        var root=Col(12);root.Children.Add(Row(Tab("すべて","all"),Tab("リクエスト","requests"),Tab("ブロック中","blocked")));
        if(_tab=="requests"){root.Children.Add(Heading("届いたフレンド申請",13));root.Children.Add(NotificationsPage(true));return root;}
        if(_tab=="blocked"){root.Children.Add(Empty("ブロックした人の声・チャット・通知・効果音は、あなたに届かなくなります。"));foreach(var name in NativeSettings.BlockedNames.ToArray())root.Children.Add(Card(Row(Face(name,36),Text(name,14,weight:FontWeight.Bold),Btn("ブロックを解除",()=>{NativeSettings.SetBlocked(name,false);RenderPage();}))));if(NativeSettings.BlockedNames.Count==0)root.Children.Add(Empty("ブロックしている人はいません"));return root;}
        var names=FriendNames.Where(n=>Match(n)).OrderByDescending(n=>UserByName(n)!=null).ToArray();
        if(names.Length==0){root.Children.Add(Empty(FriendNames.Count==0?"まだフレンドがいません。セッションの中で相手のプロフィールからフレンド申請できます":"見つかりません"));return root;}
        if(!names.Contains(_dm))_dm=names[0];
        var split=new Grid{ColumnDefinitions=new ColumnDefinitions("240,*"),ColumnSpacing=16};var list=Col(6);bool? onlineGroup=null;
        foreach(var name in names)
        {
            var user=UserByName(name);var online=user!=null;if(onlineGroup!=online){list.Children.Add(Text(online?"オンライン":"オフライン",12,Muted,FontWeight.Bold));onlineGroup=online;}
            var details=Col(2,Text(name,14,weight:FontWeight.Bold));var session=Find(_context.State.Sessions,T(user,"session"));if(session!=null)details.Children.Add(Text(T(session,"name")+" にいます",12,Muted));details.Children.Add(Text(StatusText(name),12,Muted));
            var content=new Grid{ColumnDefinitions=new ColumnDefinitions("36,*,Auto"),ColumnSpacing=10};content.Children.Add(Face(name,36));Grid.SetColumn(details,1);content.Children.Add(details);var unread=UnreadCount(DmKey(name));if(unread>0){var badge=Chip(unread.ToString(),"#C2402F","#FFFFFF");Grid.SetColumn(badge,2);content.Children.Add(badge);}
            var selected=name==_dm;var button=Btn("",()=>{_dm=name;RenderPage();});button.Content=content;button.Height=double.NaN;button.Padding=new Thickness(selected?11:12,selected?9:10);button.CornerRadius=new CornerRadius(14);button.Background=Brush(Paper);button.BorderBrush=Brush(selected?Accent:Line);button.BorderThickness=new Thickness(selected?2:1);button.HorizontalAlignment=HorizontalAlignment.Stretch;button.HorizontalContentAlignment=HorizontalAlignment.Stretch;list.Children.Add(button);
        }
        split.Children.Add(list);var chat=Col(0);var userInPane=UserByName(_dm);var header=new WrapPanel{ItemSpacing=12,LineSpacing=8,Margin=new Thickness(16,14)};header.Children.Add(Face(_dm,48));header.Children.Add(Col(2,Heading(_dm,17),Text(StatusText(_dm),12,Muted)));var common=_context.State.Groups.Where(g=>A(g,"members").Any(n=>n?.GetValue<string>()==_dm)&&IsMember(g)).Select(g=>T(g,"name")).ToArray();if(common.Length>0)header.Children.Add(Text("同じグループ："+string.Join("、",common),12,Muted));var sid=T(userInPane,"session");if(sid.Length>0&&T(userInPane,"status")!="busy")header.Children.Add(Btn(T(userInPane,"status")=="askMe"?"行ってもいい？":"参加する",()=>{if(T(userInPane,"status")=="askMe")Send(new{t="askJoin",to=T(userInPane,"id")});else Run(()=>_context.Client.JoinAsync(sid));}));else if(userInPane==null)header.Children.Add(IconTextButton("bell","来たら知らせる",()=>Send(new{t="watch",name=_dm,on=true}),14));chat.Children.Add(header);chat.Children.Add(new Border{Height=1,Background=Brush("#EEE8DD")});chat.Children.Add(Conversation(DmKey(_dm),_dm+" にメッセージを送信"));var pane=new Border{Child=chat,Background=Brush(Paper),CornerRadius=new CornerRadius(20),MinHeight=560,BoxShadow=WebShadow,ClipToBounds=true};Grid.SetColumn(pane,1);split.Children.Add(pane);root.Children.Add(split);return root;
    }
    int UnreadCount(string key)=>(_context.State.Conversations[key] as JsonArray??new()).Count(m=>T(m,"from")!=_context.State.Name&&N(m,"at")>N(_context.State.Reads,key));
    string StatusText(string name){var user=UserByName(name);var person=user??_context.State.People.FirstOrDefault(p=>T(p,"name")==name);var text=T(person,"statusText");if(text.Length>0)return text;if(user!=null)return StatusName(T(user,"status","online"));var seen=N(person,"lastSeen");return seen>0?TimeLabel(seen)+" まで":"オフライン";}
    Button Tab(string title,string tab){var b=Btn(title,()=>{_tab=tab;RenderPage();});b.Height=34;b.FontSize=13;b.CornerRadius=new CornerRadius(10);b.BorderThickness=default;b.Background=_tab==tab?Brush(Paper):Brushes.Transparent;b.Foreground=Brush(_tab==tab?Accent:"#4A4852");if(_tab==tab)b.FontWeight=FontWeight.Bold;return b;}
    Control FriendRow(JsonNode? u,bool request=false)
    {
        var name=T(u,"name");var id=T(u,"id",name);var online=UserByName(name)!=null;var sid=T(u,"session");var session=Find(_context.State.Sessions,sid);
        var info=Col(2,Text(name,14,weight:FontWeight.Bold));if(session!=null)info.Children.Add(Text(T(session,"name")+" にいます",12,Muted));info.Children.Add(Text(StatusText(name),12,Muted));
        var row=new Grid{ColumnDefinitions=new ColumnDefinitions("36,*,Auto"),ColumnSpacing=10};row.Children.Add(Face(name,36));Grid.SetColumn(info,1);row.Children.Add(info);var buttons=new WrapPanel{ItemSpacing=6,LineSpacing=6,VerticalAlignment=VerticalAlignment.Center};
        if(request)buttons.Children.Add(Btn("申請する",()=>{Send(new{t="friendRequest",to=id});_context.Notify(name+" にフレンド申請を送りました");}));
        else{if(online&&session!=null&&T(u,"status")!="busy")buttons.Children.Add(SmallButton(T(u,"status")=="askMe"?"行ってもいい？":"参加する",()=>{if(T(u,"status")=="askMe")Send(new{t="askJoin",to=id});else Run(()=>_context.Client.JoinAsync(sid));}));if(online&&T(u,"status")!="busy")buttons.Children.Add(SmallButton("誘う",()=>InviteDialog(id)));buttons.Children.Add(IconButton("chat",name+" にメッセージ",()=>Navigate("dm:"+name)));}
        Grid.SetColumn(buttons,2);row.Children.Add(buttons);var card=Card(row);card.Padding=new Thickness(12,10);return card;
    }
    Control GroupsPage()
    {
        var groups=_context.State.Groups.Where(g=>Match(T(g,"name"))).ToArray();var mine=groups.Where(IsMember).ToArray();var others=groups.Where(g=>!IsMember(g)).ToArray();var c=Col(12,ActionSection("グループ",$"所属 {mine.Length} / {_context.State.Groups.Count}","グループを作る",CreateGroup));
        if(_context.State.Groups.Count==0)c.Children.Add(Empty("グループはまだありません"));if(mine.Length>0){c.Children.Add(Text("所属しているグループ",13,Muted));foreach(var g in mine)c.Children.Add(GroupRow(g));}if(others.Length>0){c.Children.Add(Text("ほかのグループ",13,Muted));foreach(var g in others)c.Children.Add(GroupRow(g));}return c;
    }
    Control GroupRow(JsonNode? g)
    {
        var id=T(g,"id");var name=T(g,"name");var member=IsMember(g);var sessions=_context.State.Sessions.Count(s=>T(s,"group")==id);var faces=Row();faces.Spacing=0;foreach(var n in A(g,"members").Take(10)){var face=Face(n?.GetValue<string>()??"",20);face.Margin=new Thickness(faces.Children.Count==0?0:-8,0,0,0);faces.Children.Add(face);}var info=Col(4,Link(name,()=>Navigate("group:"+id)),Text($"{A(g,"members").Count} 人 · セッション {sessions} 件 · {T(g,"owner")} が作成",12,Muted),faces);
        var actions=Row();if(member)actions.Children.Add(Btn("フレンドを誘う",()=>InviteToGroup(id)));actions.Children.Add(Btn(member?"抜ける":"入る",()=>{if(member)Confirm("グループから抜ける",name+" から抜けますか？",()=>Send(new{t="groupLeave",id}));else Send(new{t="groupJoin",id});}));if(!member){((Button)actions.Children[^1]).Background=Brush(Ink);((Button)actions.Children[^1]).Foreground=Brush("#FFFFFF");}if(T(g,"owner")==_context.State.Name)actions.Children.Add(IconButton("trash","このグループを消す",()=>Confirm("グループを削除",name+" を削除しますか？",()=>Send(new{t="groupDelete",id})),14));
        var mark=(Border)Mark(Initial(name),T(g,"color",Accent),40);((TextBlock)mark.Child!).Foreground=Brush("#FFFFFF");var row=new Grid{ColumnDefinitions=new ColumnDefinitions("40,*,Auto"),ColumnSpacing=14};row.Children.Add(mark);Grid.SetColumn(info,1);row.Children.Add(info);Grid.SetColumn(actions,2);row.Children.Add(actions);var card=Card(row);card.Padding=new Thickness(16,12);return card;
    }
    Control GroupHeaderActions(JsonNode g)
    {
        var actions=new WrapPanel{ItemSpacing=8,LineSpacing=8};if(IsMember(g)){actions.Children.Add(Btn("フレンドを誘う",()=>InviteToGroup(_group)));actions.Children.Add(Btn("抜ける",()=>Confirm("グループから抜ける",T(g,"name")+" から抜けますか？",()=>{Send(new{t="groupLeave",id=_group});Navigate("groups");})));}else actions.Children.Add(Btn("入る",()=>Send(new{t="groupJoin",id=_group})));if(T(g,"owner")==_context.State.Name)actions.Children.Add(IconButton("trash","このグループを消す",()=>Confirm("グループを削除","グループとチャンネルを削除しますか？",()=>{Send(new{t="groupDelete",id=_group});Navigate("groups");})));if(IsMember(g)){var create=IconTextButton("plus","セッションを作る",()=>CreateSession("room",_group));create.Height=40;create.Background=Brush(Ink);create.Foreground=Brush("#FFFFFF");create.Content=IconLabel("plus","セッションを作る",16,"#FFFFFF");actions.Children.Add(create);}return actions;
    }
    Control GroupPage()
    {
        var g=Find(_context.State.Groups,_group);if(g==null)return Empty("このグループはもうありません");var member=IsMember(g);var c=Col(18);
        var sessions=Col(12,Section("セッション","入れる範囲はセッションごとに選ぶ"));sessions.Children.Add(Row(Chip(T(g,"name"),"#FBE9D7","#A24A16",11,22,"flag"),Text("グループのメンバーだけ",12,"#4A4852"),Chip(T(g,"name")+"＋","#FBE9D7","#A24A16",11,22,"flag"),Text("グループのメンバーと、そのフレンド",12,"#4A4852")));var groupSessions=_context.State.Sessions.Where(s=>T(s,"group")==_group).ToArray();sessions.Children.Add(groupSessions.Length>0?SessionGrid(groupSessions,true):Empty("このグループのセッションはまだありません"));c.Children.Add(sessions);
        var split=new Grid{ColumnDefinitions=new ColumnDefinitions("*,300"),ColumnSpacing=16};var chat=Col(0);if(member){var channels=A(g,"channels");if(!channels.Any(ch=>T(ch,"id")==_channel))_channel=T(channels.FirstOrDefault(),"id");var tabs=new WrapPanel{ItemSpacing=6,LineSpacing=6,Margin=new Thickness(14,12)};tabs.Children.Add(Heading("チャンネル",17));foreach(var ch in channels){var id=T(ch,"id");var tab=Btn("# "+T(ch,"name"),()=>{_channel=id;RenderPage();});tab.Height=32;tab.FontSize=13;tab.Padding=new Thickness(12,0);tab.BorderThickness=default;tab.Background=id==_channel?Brush(AccentBg):Brushes.Transparent;tab.Foreground=Brush(id==_channel?Accent:"#4A4852");tabs.Children.Add(tab);}if(T(g,"owner")==_context.State.Name)tabs.Children.Add(IconButton("plus","チャンネルを作る",()=>Prompt("チャンネルを作る","チャンネル名",name=>Send(new{t="channelCreate",group=_group,name})),14));chat.Children.Add(tabs);chat.Children.Add(new Border{Height=1,Background=Brush("#EEE8DD")});if(_channel.Length>0)chat.Children.Add(Conversation("ch:"+_group+":"+_channel,"# "+T(channels.FirstOrDefault(ch=>T(ch,"id")==_channel),"name")+" に送信",true));}else chat.Children.Add(Empty("メンバーになると、チャンネルが読めて書けるようになります"));split.Children.Add(new Border{Background=Brush(Paper),CornerRadius=new CornerRadius(20),MinHeight=520,Child=chat,BoxShadow=WebShadow,ClipToBounds=true});
        var side=Col(16);var upcoming=_context.State.Events.Where(e=>T(e,"group")==_group&&N(e,"at")>DateTimeOffset.Now.AddHours(-1).ToUnixTimeMilliseconds()).Take(4).ToArray();var eventContent=Col(10,Heading("イベント",17));if(upcoming.Length==0)eventContent.Children.Add(Text("予定はありません。チャンネルで日程の相談をすると、3 人そろったときにここに入ります",12,Muted));foreach(var ev in upcoming){var buttons=EventAnswers(ev);eventContent.Children.Add(new Border{Background=Brush(AccentBg),CornerRadius=new CornerRadius(12),Padding=new Thickness(12,10),Child=Col(4,Text(TimeLabel(N(ev,"at")),12,Accent,FontWeight.Bold),Text(T(ev,"title"),13,weight:FontWeight.Bold),Text($"来る {A(ev,"attendees").Count} · たぶん {A(ev,"maybe").Count}",12,Muted),buttons)});}side.Children.Add(Card(eventContent));var members=Col(10,Section("メンバー",$"{A(g,"members").Count} 人"));bool? lastOnline=null;foreach(var name in A(g,"members").Select(n=>n?.GetValue<string>()??"").OrderByDescending(n=>UserByName(n)!=null)){var online=UserByName(name)!=null;if(online!=lastOnline){members.Children.Add(Text(online?"オンライン":"オフライン",12,Muted,FontWeight.Bold));lastOnline=online;}members.Children.Add(Row(Face(name,32),Col(2,Text(name,14,weight:FontWeight.Bold),Text(StatusText(name),12,Muted))));}side.Children.Add(Card(members));Grid.SetColumn(side,1);split.Children.Add(side);c.Children.Add(split);return c;
    }
    Control Conversation(string key,string watermark,bool allowPlan=false)
    {
        var panel=Col(0);var messages=_context.State.Conversations[key] as JsonArray??new JsonArray();
        var list=Col(14);list.Margin=new Thickness(16,14,16,8);
        if(messages.Count==0)list.Children.Add(Empty("まだメッセージはありません", "いなくても送っておけます。"));
        foreach(var message in messages.TakeLast(100))
        {
            var from=T(message,"from","システム");var bubble=Col(6,Row(Text(from.Length>0?from:"セッションのまとめ",12,weight:FontWeight.SemiBold),Text(TimeLabel(N(message,"at")),10,Muted)));
            var text=T(message,"text");if(text.Length>0)bubble.Children.Add(Text(text,13));
            if(message?["voice"] is JsonObject voice)bubble.Children.Add(Btn($"▶ 音声メッセージ ({N(voice,"sec"):0} 秒)",()=>HomeVoiceMessage.Play(_context,T(voice,"url"))));
            if(message?["media"] is JsonObject media){if(T(media,"kind")=="image")bubble.Children.Add(new ChatMediaPreview(_context,T(media,"url")));else bubble.Children.Add(IconTextButton("play","添付動画を開く",()=>OpenUrl(T(media,"url"))));}
            if(message?["plan"] is JsonObject plan)
            {
                var id=T(message,"id");bubble.Children.Add(Text("▦ "+TimeLabel(N(plan,"at")),13,Purple));
                bubble.Children.Add(Row(Btn("来る",()=>Send(new{t="rsvp",conv=key,id,answer="yes"})),Btn("たぶん",()=>Send(new{t="rsvp",conv=key,id,answer="maybe"})),Btn("むり",()=>Send(new{t="rsvp",conv=key,id,answer="no"}))));
                var answers=plan["answers"] as JsonObject;if(answers!=null&&answers.Count>0)bubble.Children.Add(Text(string.Join(" · ",answers.Select(x=>x.Key+" "+(x.Value?.GetValue<string>() switch{"yes"=>"来る","maybe"=>"たぶん",_=>"むり"}))),11,Muted));
            }
            if(T(message,"invite") is { Length:>0 } sid)bubble.Children.Add(Btn("セッションに参加",()=>Run(()=>_context.Client.JoinAsync(sid)),true));
            if(message?["item"] is JsonObject item)bubble.Children.Add(Btn("◇ "+T(item,"summary","共有アイテム"),()=>Run(async()=>{await _context.Client.JoinAsync(T(item,"session"));_context.OpenItem(T(item,"id"));})));
            if(message?["recap"] is JsonObject recap){bubble.Children.Add(Text(T(recap,"sessionName")+" のまとめ",14,Purple,FontWeight.SemiBold));bubble.Children.Add(Text(string.Join("、",A(recap,"people").Select(n=>n?.GetValue<string>())),11,Muted));foreach(var entry in A(recap,"log").TakeLast(8))bubble.Children.Add(Text(T(entry,"name")+"  "+T(entry,"text"),12));}
            var messageRow=new Grid{ColumnDefinitions=new ColumnDefinitions("32,*"),ColumnSpacing=10};if(from.Length>0)messageRow.Children.Add(Face(from,32));Grid.SetColumn(bubble,1);messageRow.Children.Add(bubble);list.Children.Add(messageRow);
        }
        panel.Children.Add(new ScrollViewer{Content=list,MaxHeight=420,MinHeight=340,HorizontalScrollBarVisibility=Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled});
        var draft=Input("message:"+key,watermark);draft.AcceptsReturn=true;draft.TextWrapping=TextWrapping.Wrap;draft.MinHeight=36;draft.MaxHeight=72;draft.Padding=new Thickness(0,6);draft.BorderThickness=default;draft.Background=Brushes.Transparent;
        void Submit(){var value=draft.Text?.Trim();if(string.IsNullOrEmpty(value))return;Send(new{t="msg",conv=key,text=value});draft.Text="";_drafts["message:"+key]="";draft.Focus();}
        // TextBox consumes Enter in its class handler. Handle the explicit send
        // shortcut in the tunnel route, while leaving IME pre-edit untouched.
        draft.AddHandler(InputElement.KeyDownEvent,(_,e)=>
        {
            if(!e.KeyModifiers.HasFlag(KeyModifiers.Control))return;
            if(draft.GetVisualDescendants().OfType<TextPresenter>().Any(p=>!string.IsNullOrEmpty(p.PreeditText)))return;
            if(e.Key==Key.V&&!e.KeyModifiers.HasFlag(KeyModifiers.Alt)){e.Handled=true;Run(()=>PasteAttachmentsAsync(key,draft));}
            else if(e.Key==Key.Enter){e.Handled=true;Submit();}
        },RoutingStrategies.Tunnel);
        DragDrop.SetAllowDrop(panel,true);
        panel.AddHandler(DragDrop.DragOverEvent,(_,e)=>
        {
            if(!e.DataTransfer.Formats.Contains(DataFormat.File)&&!e.DataTransfer.Formats.Contains(DataFormat.Bitmap))return;
            e.DragEffects=DragDropEffects.Copy;e.Handled=true;
        },RoutingStrategies.Tunnel);
        panel.AddHandler(DragDrop.DropEvent,(_,e)=>
        {
            var media=MediaInput.ReadDrop(e.DataTransfer);if(!media.HasMedia)return;
            e.Handled=true;Run(()=>SendAttachmentsAsync(key,draft,media));
        },RoutingStrategies.Tunnel);
        var composer=new Grid{ColumnDefinitions=new ColumnDefinitions("*,Auto,Auto,Auto,Auto"),ColumnSpacing=2};composer.Children.Add(draft);
        var attach=IconButton("image","画像・動画を添付",()=>Run(()=>AttachAsync(key,draft)));Grid.SetColumn(attach,1);composer.Children.Add(attach);var voiceButton=IconButton("mic","音声メッセージ",()=>HomeVoiceMessage.ShowRecorder(_context,key));Grid.SetColumn(voiceButton,2);composer.Children.Add(voiceButton);
        if(allowPlan){var plan=IconButton("calendar","日程を相談",()=>PlanDialog(key));Grid.SetColumn(plan,3);composer.Children.Add(plan);}var send=IconButton("send","送信 · Ctrl + Enter",Submit);Grid.SetColumn(send,4);composer.Children.Add(send);
        panel.Children.Add(new Border{Margin=new Thickness(12,10,12,12),Padding=new Thickness(12,4,4,4),Background=Brush("#FFFFFF"),BorderBrush=Brush(Line),BorderThickness=new Thickness(1),CornerRadius=new CornerRadius(14),Child=composer});
        var last=N(messages.LastOrDefault(),"at");if(last>0&&last>N(_context.State.Reads,key))Send(new{t="read",conv=key,at=last});return panel;
    }

    Control EventsPage()
    {
        var c=Col(12);var tabs=Row();foreach(var (label,on) in new[]{("リスト",false),("月",true)}){var tab=Btn(label,()=>{_monthView=on;_pickedDay=null;RenderPage();});tab.Height=34;tab.FontSize=13;tab.BorderThickness=default;tab.Background=_monthView==on?Brush(Paper):Brushes.Transparent;tab.Foreground=Brush(_monthView==on?Accent:"#4A4852");tabs.Children.Add(tab);}var head=new Grid{ColumnDefinitions=new ColumnDefinitions("Auto,Auto,*,Auto"),ColumnSpacing=10};head.Children.Add(Row(Heading("イベント",17),Text($"{_context.State.Events.Count} 件",12,Muted)));Grid.SetColumn(tabs,1);head.Children.Add(tabs);var create=IconTextButton("plus","イベントを作る",CreateEvent,14);create.Background=Brush(Ink);create.Foreground=Brush("#FFFFFF");create.Content=IconLabel("plus","イベントを作る",14,"#FFFFFF");Grid.SetColumn(create,3);head.Children.Add(create);c.Children.Add(head);if(_monthView)c.Children.Add(Calendar(true));
        var events=_context.State.Events.Where(e=>Match(T(e,"title"),T(Find(_context.State.Groups,T(e,"group")),"name"))).OrderBy(e=>N(e,"at")).Where(e=>!_pickedDay.HasValue||FromMs(N(e,"at")).Date==_pickedDay.Value.Date).ToArray();
        foreach(var day in events.GroupBy(e=>FromMs(N(e,"at")).Date)){c.Children.Add(Text($"{day.Key.Month}月{day.Key.Day}日（{"日月火水木金土"[(int)day.Key.DayOfWeek]}）",13,Muted,FontWeight.Bold));foreach(var ev in day)c.Children.Add(EventCard(ev));}if(events.Length==0)c.Children.Add(Empty(_pickedDay.HasValue?"この日のイベントはありません":_context.State.Events.Count>0?"見つかりません":"イベントはまだありません"));return c;
    }
    Control EventAnswers(JsonNode? ev)
    {
        var id=T(ev,"id");var row=Row();row.Spacing=6;foreach(var (answer,label) in new[]{("yes","来る"),("maybe","たぶん"),("no","むり")}){var selected=A(ev,answer=="yes"?"attendees":answer=="maybe"?"maybe":"declined").Any(n=>n?.GetValue<string>()==_context.State.Name);var b=SmallButton(label,()=>Send(new{t="eventAttend",id,answer=selected?null:answer}));b.Height=32;if(selected){b.Background=Brush(AccentBg);b.BorderBrush=Brush(Accent);b.BorderThickness=new Thickness(2);b.Foreground=Brush(Accent);}row.Children.Add(b);}return row;
    }
    Control EventCard(JsonNode? ev)
    {
        var id=T(ev,"id");var group=Find(_context.State.Groups,T(ev,"group"));var session=Find(_context.State.Sessions,T(ev,"session"));var caption=(group!=null?T(group,"name")+" · ":"")+(session!=null?"会場："+T(session,"name"):"会場なし")+" · "+T(ev,"owner")+" が作成";var faces=Row();faces.Spacing=0;foreach(var name in A(ev,"attendees").Take(8)){var face=Face(name?.GetValue<string>()??"",20);face.Margin=new Thickness(faces.Children.Count==0?0:-8,0,0,0);faces.Children.Add(face);}faces.Children.Add(Text($"来る {A(ev,"attendees").Count} · たぶん {A(ev,"maybe").Count}",12,Muted));
        var info=Col(4,Text(T(ev,"title"),15,weight:FontWeight.Bold),Text(caption,12,Muted),faces);var row=new Grid{ColumnDefinitions=new ColumnDefinitions("90,*,Auto"),ColumnSpacing=14};row.Children.Add(Text(TimeLabel(N(ev,"at")),12,Accent,FontWeight.Bold));Grid.SetColumn(info,1);row.Children.Add(info);var actions=new WrapPanel{ItemSpacing=6,LineSpacing=6,VerticalAlignment=VerticalAlignment.Center};if(session!=null&&N(ev,"at")>DateTimeOffset.Now.AddHours(-3).ToUnixTimeMilliseconds())actions.Children.Add(Btn("会場へ",()=>Run(()=>_context.Client.JoinAsync(T(ev,"session"))),true));actions.Children.Add(EventAnswers(ev));if(T(ev,"owner")==_context.State.Name)actions.Children.Add(IconButton("trash","このイベントを消す",()=>Confirm("イベントを削除",T(ev,"title")+" を削除しますか？",()=>Send(new{t="eventDelete",id})),14));Grid.SetColumn(actions,2);row.Children.Add(actions);var card=Card(row);card.Padding=new Thickness(16,12);if(N(ev,"at")<DateTimeOffset.Now.AddHours(-3).ToUnixTimeMilliseconds())card.Opacity=.55;return card;
    }
    Control Calendar(bool selectable)
    {
        var c=Col(10);var head=Row(IconButton("left","前の月",()=>{_calendarMonth=_calendarMonth.AddMonths(-1);_pickedDay=null;RenderPage();}),Heading(_calendarMonth.ToString("yyyy年 M月"),16),IconButton("right","次の月",()=>{_calendarMonth=_calendarMonth.AddMonths(1);_pickedDay=null;RenderPage();}));if(_calendarMonth.Year!=DateTime.Today.Year||_calendarMonth.Month!=DateTime.Today.Month)head.Children.Add(SmallButton("今月",()=>{_calendarMonth=DateTime.Today;_pickedDay=null;RenderPage();}));c.Children.Add(head);
        var grid=new Grid{ColumnDefinitions=new ColumnDefinitions("*,*,*,*,*,*,*"),RowDefinitions=new RowDefinitions("Auto,Auto,Auto,Auto,Auto,Auto,Auto"),RowSpacing=4,ColumnSpacing=4};var labels=new[]{"月","火","水","木","金","土","日"};for(var i=0;i<7;i++){var t=Text(labels[i],11,Muted);t.HorizontalAlignment=HorizontalAlignment.Center;t.Margin=new Thickness(0,4);Grid.SetColumn(t,i);grid.Children.Add(t);}
        var first=new DateTime(_calendarMonth.Year,_calendarMonth.Month,1);var lead=((int)first.DayOfWeek+6)%7;
        for(var day=1;day<=DateTime.DaysInMonth(first.Year,first.Month);day++){var date=first.AddDays(day-1);var content=Col(3,Text(day.ToString(),12,date==DateTime.Today?Accent:Ink,FontWeight.Bold));var events=_context.State.Events.Where(e=>FromMs(N(e,"at")).Date==date).ToArray();foreach(var ev in events.Take(2))content.Children.Add(new Border{Background=Brush(Sand),Padding=new Thickness(6,1),CornerRadius=new CornerRadius(6),Child=Text(T(ev,"title"),11,Ink,FontWeight.SemiBold)});if(events.Length>2)content.Children.Add(Text($"ほか {events.Length-2}",11,Muted));var button=Btn("",()=>{if(selectable){_pickedDay=_pickedDay==date?null:date;RenderPage();}});button.Content=content;button.Padding=new Thickness(6);button.Height=double.NaN;button.MinHeight=72;button.VerticalContentAlignment=VerticalAlignment.Top;button.HorizontalContentAlignment=HorizontalAlignment.Stretch;button.HorizontalAlignment=HorizontalAlignment.Stretch;button.Background=Brush(_pickedDay==date?AccentBg:"#FFFFFF");button.BorderBrush=Brush(date==DateTime.Today?Accent:"#EEE8DD");Grid.SetColumn(button,(lead+day-1)%7);Grid.SetRow(button,1+(lead+day-1)/7);grid.Children.Add(button);}c.Children.Add(grid);return Card(c);
    }
    void RenderAside()
    {
        _aside.Children.Clear();
        var widgets=new[]{("now","フレンドの今","friends"),("events","イベント","events"),("sessions","参加できるセッション","sessions"),("worlds","ワールド","worlds"),("items","アイテム","items")};var current=widgets.First(w=>w.Item1==_widget);
        var title=Btn("",()=>{});title.Content=Row(Heading(current.Item2,17),Icon("down",16));title.Background=Brushes.Transparent;title.BorderThickness=default;title.Height=36;title.Padding=new Thickness(6,4);title.HorizontalContentAlignment=HorizontalAlignment.Left;
        var header=new Grid{ColumnDefinitions=new ColumnDefinitions("*,Auto")};header.Children.Add(title);var more=IconButton("right",current.Item2+"のページを開く",()=>Navigate(current.Item3),14);more.Width=32;more.Height=32;Grid.SetColumn(more,1);header.Children.Add(more);_aside.Children.Add(header);
        title.Click+=(_,_)=>{var choices=Col(2);var popup=new Flyout{Content=choices};foreach(var widget in widgets){var b=Btn("",()=>{_widget=widget.Item1;popup.Hide();RenderAside();});b.Content=Row(Text(widget.Item2,13),Icon(widget.Item1==_widget?"check":"right",16));b.Background=Brushes.Transparent;b.BorderThickness=default;b.HorizontalAlignment=HorizontalAlignment.Stretch;b.HorizontalContentAlignment=HorizontalAlignment.Left;b.Height=36;choices.Children.Add(b);}popup.ShowAt(title);};
        if(_widget=="events")
        {
            var start=DateTime.Today.AddDays(-((int)DateTime.Today.DayOfWeek+6)%7);var week=new Grid{ColumnDefinitions=new ColumnDefinitions("*,*,*,*,*,*,*"),ColumnSpacing=2,Margin=new Thickness(0,6,0,10)};
            for(var i=0;i<7;i++){var day=start.AddDays(i);var c=Col(2,Text("日月火水木金土"[(int)day.DayOfWeek].ToString(),10,Muted),Text(day.Day.ToString(),13,day==DateTime.Today?Accent:Ink,FontWeight.Bold));foreach(var child in c.Children)child.HorizontalAlignment=HorizontalAlignment.Center;if(_context.State.Events.Any(e=>FromMs(N(e,"at")).Date==day))c.Children.Add(new Border{Width=5,Height=5,CornerRadius=new CornerRadius(3),Background=Brush(Accent),HorizontalAlignment=HorizontalAlignment.Center});var cell=new Border{Padding=new Thickness(0,6),CornerRadius=new CornerRadius(10),Background=day==DateTime.Today?Brush(AccentBg):Brushes.Transparent,Child=c};Grid.SetColumn(cell,i);week.Children.Add(cell);}_aside.Children.Add(week);
            var now=DateTimeOffset.Now.ToUnixTimeMilliseconds();var events=_context.State.Events.Where(e=>N(e,"at")>now-3600000&&N(e,"at")<now+7*86400000L).Take(4).ToArray();
            if(events.Length==0)_aside.Children.Add(Empty("この 1 週間のイベントはありません"));
            foreach(var ev in events){var g=Find(_context.State.Groups,T(ev,"group"));var count=A(ev,"attendees").Count(n=>FriendNames.Contains(n?.GetValue<string>()??""));var labels=new Grid{ColumnDefinitions=new ColumnDefinitions("*,Auto")};labels.Children.Add(Text(TimeLabel(N(ev,"at")),12,Accent,FontWeight.Bold));var group=Text(T(g,"name"),12,Muted);Grid.SetColumn(group,1);labels.Children.Add(group);var faces=Row();faces.Spacing=0;foreach(var name in A(ev,"attendees").Take(4)){var face=Face(name?.GetValue<string>()??"",20);face.Margin=new Thickness(faces.Children.Count==0?0:-8,0,0,0);faces.Children.Add(face);}faces.Children.Add(Text(count>0?$"フレンド {count} 人":$"{A(ev,"attendees").Count} 人",12,Muted));var button=Btn("",()=>Navigate("events"));button.Content=Col(6,labels,Text(T(ev,"title"),14,weight:FontWeight.Bold),faces);button.Height=double.NaN;button.Padding=new Thickness(12);button.Background=Brush(FromMs(N(ev,"at")).Date==DateTime.Today?AccentBg:Sand);button.BorderThickness=default;button.CornerRadius=new CornerRadius(14);button.HorizontalContentAlignment=HorizontalAlignment.Stretch;button.HorizontalAlignment=HorizontalAlignment.Stretch;_aside.Children.Add(button);}
            _aside.Children.Add(TextLink("カレンダーを開く",()=>Navigate("events")));return;
        }
        if(_widget is "sessions" or "now")
        {
            var sessions=SortedSessions().Where(s=>_widget!="now"||_context.State.Users.Any(u=>T(u,"session")==T(s,"id")&&FriendNames.Contains(T(u,"name")))).ToArray();
            foreach(var session in sessions){var id=T(session,"id");var here=_context.State.Users.Where(u=>T(u,"session")==id).ToArray();var nf=here.Count(u=>FriendNames.Contains(T(u,"name")));var world=T(_context.State.SessionInfo[id],"world",T(session,"world","room"));_aside.Children.Add(WidgetRow(Icon("globe",14,"#4A4852"),Worlds.FirstOrDefault(w=>w.Id==world).Color??Worlds[0].Color,T(session,"name"),$"{WorldName(world)} · {here.Length} 人"+(nf>0?$" · フレンド {nf} 人":""),()=>Run(()=>_context.Client.JoinAsync(id))));}
            if(sessions.Length==0)_aside.Children.Add(Empty(_widget=="now"?"フレンドがいるセッションはありません":"参加できるセッションがありません"));return;
        }
        if(_widget=="worlds"){foreach(var world in Worlds){var count=_context.State.Sessions.Count(s=>T(_context.State.SessionInfo[T(s,"id")],"world",T(s,"world","room"))==world.Id);_aside.Children.Add(WidgetRow(Icon("globe",14,"#4A4852"),world.Color,world.Name,$"セッション {count} 件",()=>Navigate("worlds")));}return;}
        foreach(var item in Items)_aside.Children.Add(WidgetRow(Text(item.Mark,item.Mark.Length>2?11:16,ItemInk(item.Id),FontWeight.ExtraBold),item.Color,item.Name,ItemGenre(item.Id),()=>{if(_context.State.SessionId==null)Navigate("items");else SpawnItem(item.Id);}));
    }
    Control WidgetRow(Control thumb,string tint,string name,string subtitle,Action action){var b=Btn("",action);thumb.HorizontalAlignment=HorizontalAlignment.Center;thumb.VerticalAlignment=VerticalAlignment.Center;b.Content=Row(new Border{Width=40,Height=32,CornerRadius=new CornerRadius(9),Background=Brush(tint),Child=thumb},Col(2,Text(name,13,weight:FontWeight.Bold),Text(subtitle,12,Muted)));b.BorderThickness=default;b.Background=Brushes.Transparent;b.Height=double.NaN;b.Padding=new Thickness(8);b.CornerRadius=new CornerRadius(12);b.HorizontalAlignment=HorizontalAlignment.Stretch;b.HorizontalContentAlignment=HorizontalAlignment.Left;return b;}
    Control WorldsPage()
    {
        var current=_context.State.SessionId!=null;var c=Col(12);if(current)c.Children.Add(CurrentSession());c.Children.Add(Section("ワールド",current?"選ぶと、いまのセッションのワールドを切り替える":"セッションが読み込む 3D 空間"));var cards=new HomeCardGrid(260,14);
        foreach(var w in Worlds.Where(w=>Match(w.Name,w.Desc)))
        {
            var now=current&&_context.State.World==w.Id;var preview=new Grid{Height=80};preview.Children.Add(Icon("globe",28,"#4A4852"));if(now){var here=HereBadge("いまのワールド");here.HorizontalAlignment=HorizontalAlignment.Left;here.VerticalAlignment=VerticalAlignment.Top;here.Margin=new Thickness(10);preview.Children.Add(here);}
            var body=Col(8,new Border{Height=80,Background=Brush(w.Color),CornerRadius=new CornerRadius(12),Child=preview},Heading(w.Name,16),Text(w.Desc,12,Muted));body.Children.Add(Text($"このワールドのセッション {_context.State.Sessions.Count(s=>T(_context.State.SessionInfo[T(s,"id")],"world",T(s,"world","room"))==w.Id)} 件",12,Muted));
            if(current){var select=Btn(now?"いまのワールド":"このワールドに切り替える",()=>Confirm("ワールドを切り替える","セッション全員のワールドを「"+w.Name+"」に切り替えます。",()=>Run(()=>_context.Client.SendRoomAsync(new{t="world",world=w.Id}))),true);select.IsEnabled=!now&&_context.State.WorldPending==null;select.HorizontalAlignment=HorizontalAlignment.Stretch;body.Children.Add(select);}
            var create=IconTextButton("plus","このワールドでセッションを作る",()=>CreateSession(w.Id),14);if(!current){create.Background=Brush(Ink);create.Foreground=Brush("#FFFFFF");create.Content=IconLabel("plus","このワールドでセッションを作る",14,"#FFFFFF");}create.HorizontalAlignment=HorizontalAlignment.Stretch;body.Children.Add(create);var card=Card(body);card.CornerRadius=new CornerRadius(18);if(now){card.BorderBrush=Brush("#2E9A64");card.BorderThickness=new Thickness(2);}cards.Children.Add(card);
        }c.Children.Add(cards);return c;
    }
    Control ItemsPage()
    {
        var c=Col(12,Section("アイテム",_context.State.SessionId!=null?"目の前に出せる":"セッションの中で「出す」と使える"));var cards=new HomeCardGrid(260,14);
        foreach(var item in Items.Where(i=>Match(i.Name,i.Desc,ItemGenre(i.Id))))
        {
            var heading=new WrapPanel{ItemSpacing=4,LineSpacing=4};heading.Children.Add(Text(item.Name,14,weight:FontWeight.Bold));heading.Children.Add(Chip(ItemGenre(item.Id)));if(item.Id!="camera")heading.Children.Add(Chip("2D",Ink,"#FFFFFF",10,18));if(item.Id!="g2048")heading.Children.Add(Chip("3D",Ink,"#FFFFFF",10,18));
            var info=Col(4,heading,Text(item.Desc,12,Muted));if(_context.State.SessionId!=null){var spawn=IconTextButton("plus","目の前に出す",()=>SpawnItem(item.Id),12);spawn.Background=Brush(Accent);spawn.Foreground=Brush("#FFFFFF");spawn.Content=IconLabel("plus","目の前に出す",12,"#FFFFFF",12);spawn.Height=30;spawn.Padding=new Thickness(10,0);spawn.IsEnabled=item.Id!="camera"||_context.State.Mode=="3d";info.Children.Add(spawn);}
            var row=new Grid{ColumnDefinitions=new ColumnDefinitions("44,*"),ColumnSpacing=12};row.Children.Add(ItemMark(item.Id,item.Mark,item.Color,44));Grid.SetColumn(info,1);row.Children.Add(info);var card=Card(row);card.Padding=new Thickness(14);card.CornerRadius=new CornerRadius(18);cards.Children.Add(card);
        }c.Children.Add(cards);return c;
    }
    void SpawnItem(string kind)=>Run(async()=>{await _context.Client.SendRoomAsync(new{t="itemCreate",kind,x=0,z=1.5,ry=0});_context.Notify("アイテムを出しました");_context.ShowHome("close");});
    static string ItemGenre(string id)=>id is "note" or "canvas" or "camera"?"ツール":id is "hammer" or "dice"?"あそび":"ゲーム";
    static string ItemInk(string id)=>id switch{"note" or "g2048"=>"#7A5B0E","hammer"=>"#A24A16","chess"=>"#2F4A9C","chessAi" or "camera"=>"#2E6E4E","canvas"=>"#9A3A62",_=>"#7A4A22"};
    static Control ItemMark(string id,string mark,string color,double size){var m=(Border)Mark(mark,color,size);((TextBlock)m.Child!).Foreground=Brush(ItemInk(id));return m;}
    Control NotificationsPage(bool onlyFriends=false)
    {
        var c=Col(10);foreach(var n in _context.State.Notifications.ToArray().Where(n=>!onlyFriends||NoticeKind(n)=="friend"))
        {
            var from=T(n,"from");var name=T(n,"fromName",from);var kind=NoticeKind(n);var row=Row(Mark(Initial(name),"#E4DDEB",34),Col(4,Text(name+(kind=="friend"?" からフレンド申請":kind=="online"?" がオンラインになりました":kind=="invite"?" からのお誘い":kind=="askJoin"?" が参加してもよいか聞いています":" からのお知らせ"),13),Text(TimeLabel(N(n,"at")),10,Muted)));
            void Remove(){_context.State.Notifications.Remove(n);_signature="";Refresh();}
            if(kind=="friend")row.Children.Add(Btn("承認",()=>{Send(new{t="friendAccept",to=from});Remove();},true));
            if(kind=="invite"){var key=T(n,"key",T(n,"kind")+":"+T(n,"targetId"));row.Children.Add(Btn("参加",()=>{if(key.StartsWith("group:")){Send(new{t="groupJoin",id=key[6..]});Navigate(key);}else Run(()=>_context.Client.JoinAsync(key.StartsWith("session:")?key[8..]:key));Remove();},true));}
            if(kind=="askJoin"&&_context.State.SessionId is string current)row.Children.Add(Btn("どうぞ",()=>{Send(new{t="invite",kind="session",id=current,to=from});Remove();},true));
            if(kind=="liveRequest")row.Children.Add(Btn("視点ライブを始める",()=>{Run(()=>_context.Client.SendRoomAsync(new{t="viewLive",on=true}));Remove();},true));
            if(kind=="online")row.Children.Add(Btn("メッセージ",()=>{Navigate("dm:"+name);Remove();}));row.Children.Add(Btn("×",Remove));c.Children.Add(Card(row));
        }
        if(c.Children.Count==0)c.Children.Add(Empty("新しい通知はありません","フレンド申請やお誘いが届くと、ここに表示されます。"));return c;
    }

    void CreateSession(string world="room",string? group=null)
    {
        var name=new TextBox{PlaceholderText="セッション名",MaxLength=40};var topic=new TextBox{PlaceholderText="何をする場所か（任意）",MaxLength=100};var worlds=Choice(Worlds.Select(w=>(w.Id,w.Name)),world);
        var visibility=Choice(new[]{("public","パブリック · だれでも"),("friends","フレンド+"),("invite","招待された人だけ"),("group","グループのメンバーだけ"),("groupPlus","グループとフレンド")},group==null?"public":"group");
        var groups=Choice(_context.State.Groups.Where(IsMember).Select(g=>(T(g,"id"),T(g,"name"))),group??"");
        Form("セッションを作る",[("セッション名",name),("トピック",topic),("ワールド",worlds),("公開範囲",visibility),("グループ",groups)],()=>{if(string.IsNullOrWhiteSpace(name.Text))return "セッション名を入力してください。";var vis=Selected(visibility);var gid=group??Selected(groups);if(vis is "group" or "groupPlus"&&gid.Length==0)return "グループを選んでください。";Send(new{t="sessionCreate",name=name.Text.Trim(),topic=topic.Text??"",world=Selected(worlds),visibility=vis,group=vis is "group" or "groupPlus"?gid:null});return null;});
    }
    void CreateGroup()
    {
        var name=new TextBox{PlaceholderText="グループ名",MaxLength=40};var colors=Choice(new[]{("#9E8DAC","ライラック"),("#88A58D","セージ"),("#CD9A77","アプリコット"),("#7C9BB0","ブルー"),("#B98391","ローズ")},"#9E8DAC");
        Form("グループを作る",[("グループ名",name),("色",colors)],()=>{if(string.IsNullOrWhiteSpace(name.Text))return "グループ名を入力してください。";Send(new{t="groupCreate",name=name.Text.Trim(),color=Selected(colors)});return null;});
    }
    void CreateEvent()
    {
        var name=new TextBox{PlaceholderText="イベント名",MaxLength=60};var time=new TextBox{Text=DateTime.Now.AddHours(1).ToString("yyyy-MM-dd HH:00")};var groups=Choice(new[]{("","なし")}.Concat(_context.State.Groups.Where(IsMember).Select(g=>(T(g,"id"),T(g,"name")))));var sessions=Choice(new[]{("","なし")}.Concat(_context.State.Sessions.Select(s=>(T(s,"id"),T(s,"name")))));
        Form("イベントを作る",[("イベント名",name),("日時（例 2026-10-22 20:00）",time),("グループ",groups),("会場のセッション",sessions)],()=>{if(string.IsNullOrWhiteSpace(name.Text))return "イベント名を入力してください。";if(!DateTime.TryParse(time.Text,out var at))return "日時を確認してください。";Send(new{t="eventCreate",title=name.Text.Trim(),at=new DateTimeOffset(at).ToUnixTimeMilliseconds(),group=NullIfEmpty(Selected(groups)),session=NullIfEmpty(Selected(sessions))});return null;});
    }
    void PlanDialog(string conversation)
    {
        var text=new TextBox{PlaceholderText="何をする？"};var time=new TextBox{Text=DateTime.Now.AddDays(1).ToString("yyyy-MM-dd 20:00")};var sessions=Choice(new[]{("","なし")}.Concat(_context.State.Sessions.Select(s=>(T(s,"id"),T(s,"name")))));
        Form("日程を相談する",[("メッセージ",text),("日時",time),("会場",sessions)],()=>{if(!DateTime.TryParse(time.Text,out var at))return "日時を確認してください。";Send(new{t="msg",conv=conversation,text=text.Text??"この日に集まりませんか？",plan=new{at=new DateTimeOffset(at).ToUnixTimeMilliseconds(),session=NullIfEmpty(Selected(sessions))}});return null;},"送信");
    }
    void StatusDialog()
    {
        var self=UserByName(_context.State.Name);var choice=Choice(new[]{("joinMe","参加 OK"),("online","オンライン"),("askMe","声かけて"),("busy","取り込み中")},T(self,"status","online"));var text=new TextBox{Text=T(self,"statusText"),PlaceholderText="いまの気分、ひとこと",MaxLength=32};Form("ステータス",[("今の状態",choice),("ひとこと（32文字）",text)],()=>{Send(new{t="setStatus",status=Selected(choice),text=text.Text??""});return null;},"保存");
    }
    void InviteDialog(string to)
    {
        var options=_context.State.Sessions.Select(s=>("session:"+T(s,"id"),"セッション · "+T(s,"name"))).Concat(_context.State.Groups.Where(IsMember).Select(g=>("group:"+T(g,"id"),"グループ · "+T(g,"name"))));var target=Choice(options);Form("フレンドを誘う",[("誘う場所",target)],()=>{var key=Selected(target);if(key.Length==0)return "セッションまたはグループを選んでください。";var parts=key.Split(':',2);Send(new{t="invite",kind=parts[0],id=parts[1],to});return null;},"誘う");
    }
    void InviteToGroup(string id)
    {
        var choices=Choice(_context.State.Users.Where(u=>FriendNames.Contains(T(u,"name"))).Select(u=>(T(u,"id"),T(u,"name"))));Form("フレンドを誘う",[("オンラインのフレンド",choices)],()=>{var to=Selected(choices);if(to.Length==0)return "オンラインのフレンドがいません。";Send(new{t="invite",kind="group",id,to});return null;},"誘う");
    }
    void Prompt(string title,string label,Action<string> action){var input=new TextBox{PlaceholderText=label};Form(title,[(label,input)],()=>{if(string.IsNullOrWhiteSpace(input.Text))return label+"を入力してください。";action(input.Text.Trim());return null;});}
    void Confirm(string title,string message,Action action)=>Form(title,[("",Text(message,14))],()=>{action();return null;},"続ける");
    void Form(string title,(string Label,Control Control)[] fields,Func<string?> submit,string button="作る")
    {
        var window=new Window{Title=title,Width=460,SizeToContent=SizeToContent.Height,CanResize=false,WindowStartupLocation=WindowStartupLocation.CenterOwner,Background=Brush("#F6F2ED"),ShowInTaskbar=false};var c=Col(14);c.Margin=new Thickness(24);c.Children.Add(Text(title,22,weight:FontWeight.Bold));foreach(var (label,control) in fields){if(label.Length>0)c.Children.Add(Text(label,12,Muted));control.HorizontalAlignment=HorizontalAlignment.Stretch;c.Children.Add(control);}var error=Text("",12,"#AE4949");c.Children.Add(error);c.Children.Add(Row(Btn("やめる",()=>window.Close()),Btn(button,()=>{var problem=submit();if(problem!=null){error.Text=problem;return;}window.Close();},true)));window.Content=c;window.Opened+=async(_,_)=>{fields.Select(f=>f.Control).OfType<TextBox>().FirstOrDefault()?.Focus();await Linux.LinuxInputMethod.RestoreInitialClientAsync(window);};_ = window.ShowDialog(_context.Owner);
    }

    HashSet<string> FriendNames=>_context.State.Friends.Select(n=>n is JsonValue?n.GetValue<string>():T(n,"name")).ToHashSet(StringComparer.Ordinal);
    bool IsMember(JsonNode? group)=>A(group,"members").Any(n=>n?.GetValue<string>()==_context.State.Name);
    JsonNode? UserByName(string name)=>_context.State.Users.FirstOrDefault(u=>T(u,"name")==name);
    bool Match(params string[] values)=>string.IsNullOrWhiteSpace(_search)||values.Any(v=>v.Contains(_search,StringComparison.OrdinalIgnoreCase));
    string DmKey(string name)=>"dm:"+string.Join('\0',new[]{name,_context.State.Name}.OrderBy(n=>n,StringComparer.Ordinal));
    void OpenConversation(string key){if(key.StartsWith("dm:"))Navigate("dm:"+(key[3..].Split('\0').FirstOrDefault(n=>n!=_context.State.Name)??_context.State.Name));else{var parts=key.Split(':');if(parts.Length>=3){_group=parts[1];_channel=parts[2];Navigate("group");}}}
    string ConversationTitle(string key){if(key.StartsWith("dm:"))return(key[3..].Split('\0').FirstOrDefault(n=>n!=_context.State.Name)??_context.State.Name)+" · DM";var p=key.Split(':');if(p.Length<3)return key;var g=Find(_context.State.Groups,p[1]);return T(g,"name","グループ")+" #"+T(A(g,"channels").FirstOrDefault(x=>T(x,"id")==p[2]),"name");}
    void Send(object message)=>Run(()=>_context.Client.SendAsync(message));
    sealed record AttachmentTarget(string Server,string Name,string SelfId);
    AttachmentTarget AttachmentDestination()=>new(_context.State.ServerUrl,_context.State.Name,_context.State.SelfId);
    bool IsAttachmentDestination(AttachmentTarget target)=>target.Server==_context.State.ServerUrl&&target.Name==_context.State.Name&&target.SelfId==_context.State.SelfId;
    async Task AttachAsync(string conversation,TextBox draft)
    {
        var target=AttachmentDestination();
        var picker=TopLevel.GetTopLevel(this)?.StorageProvider;if(picker==null)return;
        var files=await picker.OpenFilePickerAsync(new FilePickerOpenOptions{Title="画像・動画を添付",AllowMultiple=true,FileTypeFilter=[new FilePickerFileType("画像・動画"){Patterns=["*.jpg","*.jpeg","*.png","*.gif","*.webp","*.mp4","*.webm"]}]});
        if(files.Count==0)return;
        await SendAttachmentsAsync(conversation,draft,new MediaInputContent(files,null,""),target);
    }
    async Task PasteAttachmentsAsync(string conversation,TextBox draft)
    {
        var target=AttachmentDestination();
        var clipboard=TopLevel.GetTopLevel(draft)?.Clipboard;if(clipboard==null)return;
        var input=await MediaInput.ReadClipboardAsync(clipboard);
        if(input.HasMedia)await SendAttachmentsAsync(conversation,draft,input,target);
        else if(IsAttachmentDestination(target))draft.Paste();
    }
    async Task SendAttachmentsAsync(string conversation,TextBox draft,MediaInputContent input,AttachmentTarget? target=null)
    {
        if(!input.HasMedia)return;
        target??=AttachmentDestination();
        var caption=draft.Text??"";var sent=0;var failed=0;
        bool StillCurrent()
        {
            if(IsAttachmentDestination(target))return true;
            _context.Notify("接続先またはユーザーが変わったため、添付の送信を中止しました");return false;
        }
        if(!StillCurrent())return;
        _context.Notify("添付をアップロードしています…");
        async Task<bool> SendMedia(JsonObject media)
        {
            if(!StillCurrent())return false;
            await _context.Client.SendAsync(new{t="msg",conv=conversation,text=sent==0?caption:"",media});
            sent++;
            if(sent==1&&IsAttachmentDestination(target)&&draft.Text==caption){draft.Text="";_drafts["message:"+conversation]="";}
            return true;
        }
        foreach(var file in input.Files.Where(f=>MediaAttachments.IsSupportedFileName(f.Name)).Take(MediaAttachments.MaxFiles))
        {
            if(!StillCurrent())return;
            try{if(!await SendMedia(await MediaAttachments.UploadAsync(target.Server,file)))return;}
            catch(Exception error){failed++;_context.Notify(file.Name+": "+error.Message);}
        }
        if(input.Files.Count==0&&input.PngBytes is {Length:>0} png)
        {
            if(!StillCurrent())return;
            try{if(!await SendMedia(await MediaAttachments.UploadBytesAsync(target.Server,png,"clipboard.png")))return;}
            catch(Exception error){failed++;_context.Notify("クリップボード画像: "+error.Message);}
        }
        if(sent>0)_context.Notify(failed>0?$"添付を {sent} 件送りました（{failed} 件は送信できませんでした）":sent>1?$"添付を {sent} 件送りました":"添付を送りました");
    }
    Control MessageImage(string url)
    {
        var image=new Image{MaxHeight=240,MaxWidth=480,Stretch=Stretch.Uniform,HorizontalAlignment=HorizontalAlignment.Left};
        if(_imageCache.TryGetValue(url,out var bitmap))image.Source=bitmap;else _=Load();
        return image;
        async Task Load(){try{var bytes=await Http.GetByteArrayAsync(new Uri(new Uri(_context.State.ServerUrl.TrimEnd('/')+"/"),url));using var stream=new MemoryStream(bytes);var loaded=new Bitmap(stream);if(!_imageCache.TryAdd(url,loaded)){loaded.Dispose();loaded=_imageCache[url];}await Dispatcher.UIThread.InvokeAsync(()=>image.Source=loaded);}catch{/* The open-attachment button remains available. */}}
    }
    async void Run(Func<Task> action){try{await action();}catch(Exception ex){_context.Notify(ex.Message);}}
    void OpenUrl(string url){if(url.StartsWith('/'))url=_context.State.ServerUrl.TrimEnd('/')+url;try{System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url){UseShellExecute=true});}catch(Exception ex){_context.Notify(ex.Message);}}
    TextBox Input(string key,string placeholder){var box=new TextBox{PlaceholderText=placeholder,Text=_drafts.GetValueOrDefault(key,""),FontSize=13,CornerRadius=new CornerRadius(10),Background=Brush(Paper)};box.TextChanged+=(_,_)=>_drafts[key]=box.Text??"";_inputs[key]=box;return box;}
    static ComboBox Choice(IEnumerable<(string Id,string Name)> values,string selected=""){var items=values.Select(v=>new ComboBoxItem{Content=v.Name,Tag=v.Id}).ToArray();var cb=new ComboBox{ItemsSource=items,HorizontalAlignment=HorizontalAlignment.Stretch};cb.SelectedItem=items.FirstOrDefault(x=>(string?)x.Tag==selected)??items.FirstOrDefault();return cb;}
    static string Selected(ComboBox choice)=>(choice.SelectedItem as ComboBoxItem)?.Tag as string??"";
    static string? NullIfEmpty(string s)=>s.Length==0?null:s;
    static string NoticeKind(JsonNode? n)=>T(n,"t") switch {"friendRequest"=>"friend","invite"=>"invite",""=>T(n,"kind"),var type=>type};
    static JsonNode? Find(JsonArray a,string id)=>a.FirstOrDefault(n=>T(n,"id")==id);
    static JsonArray A(JsonNode? n,string key)=>n is JsonObject o&&o[key] is JsonArray a?a:new JsonArray();
    static string T(JsonNode? n,string key,string fallback="")=>n is JsonObject o&&o[key] is JsonValue v&&v.TryGetValue<string>(out var s)?s:fallback;
    static double N(JsonNode? n,string key)=>n is JsonObject o&&o[key] is JsonValue v&&(v.TryGetValue<double>(out var d)||double.TryParse(v.ToString(),NumberStyles.Float,CultureInfo.InvariantCulture,out d))?d:0;
    static DateTime FromMs(double value){try{return DateTimeOffset.FromUnixTimeMilliseconds((long)value).LocalDateTime;}catch{return DateTime.Now;}}
    static string TimeLabel(double ms){if(ms<=0)return "";var at=FromMs(ms);var day=(at.Date-DateTime.Today).Days;var hm=at.ToString("H:mm");return day switch{0=>"今日 "+hm,1=>"明日 "+hm,-1=>"昨日 "+hm,>=2 and <7=>"日月火水木金土"[(int)at.DayOfWeek]+" "+hm,_=>$"{at.Month}/{at.Day}（{"日月火水木金土"[(int)at.DayOfWeek]}） {hm}"};}
    static string Initial(string s)=>s.Length>0?s[..1]:"?";
    static string WorldName(string id)=>Worlds.FirstOrDefault(w=>w.Id==id).Name??"ホール";
    static string VisibilityName(string id)=>id switch{"friends"=>"フレンド+","group"=>"グループ","groupPlus"=>"グループ+","invite"=>"インバイト",_=>"パブリック"};
    static string StatusName(string id)=>id switch{"joinMe"=>"参加 OK","askMe"=>"声かけて","busy"=>"取り込み中",_=>"オンライン"};
    static IBrush Brush(string color)=>new SolidColorBrush(Color.Parse(color));
    static BoxShadows WebShadow=>new(new BoxShadow{OffsetX=0,OffsetY=8,Blur=30,Color=Color.FromArgb(31,60,40,10)});
    static TextBlock Text(string text,double size=14,string color=Ink,FontWeight? weight=null)=>new(){Text=text,FontFamily=Ui.BodyFont,FontSize=size,Foreground=Brush(color),FontWeight=weight??FontWeight.Normal,TextWrapping=TextWrapping.Wrap,VerticalAlignment=VerticalAlignment.Center};
    static TextBlock Heading(string text,double size){var block=Text(text,size,Ink,FontWeight.Bold);block.FontFamily=Ui.HeadingFont;return block;}
    static StackPanel Col(double spacing=8,params Control[] children){var p=new StackPanel{Spacing=spacing};foreach(var c in children)p.Children.Add(c);return p;}
    static StackPanel Row(params Control[] children){var p=new StackPanel{Orientation=Orientation.Horizontal,Spacing=9,VerticalAlignment=VerticalAlignment.Center};foreach(var c in children)p.Children.Add(c);return p;}
    static Border Card(Control content,string color=Paper)=>new(){Background=Brush(color),CornerRadius=new CornerRadius(16),Padding=new Thickness(16),Child=content,BoxShadow=WebShadow};
    static Control Mark(string text,string color,double size)=>new Border{Width=size,Height=size,Background=Brush(color),CornerRadius=new CornerRadius(size*.3),Child=new TextBlock{Text=text,FontFamily=Ui.BodyFont,FontSize=text.Length>2?size*.3:size*.44,FontWeight=FontWeight.Bold,Foreground=Brush(Ink),HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center}};
    static Control Icon(string name,double size=16,string color=Ink)=>new WebIcon(name,size,Brush(color)){HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
    static Control IconLabel(string name,string text,double size=16,string color=Ink,double textSize=14,double spacing=6){var row=Row(Icon(name,size,color),Text(text,textSize,color,FontWeight.SemiBold));row.Spacing=spacing;return row;}
    static Button IconTextButton(string icon,string text,Action action,double size=16){var button=Btn("",action);button.Content=IconLabel(icon,text,size);Avalonia.Automation.AutomationProperties.SetName(button,text);return button;}
    static Button IconButton(string icon,string label,Action action,double size=16){var button=Btn("",action);button.Content=Icon(icon,size);button.Padding=default;button.Width=36;button.Height=36;button.BorderThickness=default;button.Background=Brushes.Transparent;ToolTip.SetTip(button,label);Avalonia.Automation.AutomationProperties.SetName(button,label);return button;}
    static Control BrandMark()=>new Border{Width=34,Height=34,CornerRadius=new CornerRadius(10),ClipToBounds=true,Child=WebAssets.Image("brand/mark.png",34,34)};
    static Control Chip(string text,string color=Sand,string ink="#4A4852",double size=11,double height=22,string? icon=null)=>new Border{Background=Brush(color),CornerRadius=new CornerRadius(8),Padding=new Thickness(8,0),Height=height,Child=icon==null?Text(text,size,ink,FontWeight.Bold):IconLabel(icon,text,size,ink,size,4)};
    static Control HereBadge(string text="参加中")=>new Border{Background=Brush("#E3F2E8"),CornerRadius=new CornerRadius(10),Padding=new Thickness(12,0),Height=32,Child=Row(new Border{Width=8,Height=8,CornerRadius=new CornerRadius(4),Background=Brush("#2E9A64"),VerticalAlignment=VerticalAlignment.Center},Text(text,12,"#2E6E4E",FontWeight.Bold))};
    void UpdateColumns(){var show=Bounds.Width>1100&&_page!="group";_root.ColumnDefinitions[2].Width=show?new GridLength(300):new GridLength(0);if(_asideScroll!=null)_asideScroll.IsVisible=show;var wrap=_page=="group"&&Bounds.Width<1200;Grid.SetRow(_actionHost,wrap?1:0);Grid.SetColumn(_actionHost,wrap?0:3);Grid.SetColumnSpan(_actionHost,wrap?4:1);Grid.SetColumnSpan(_headingHost,wrap?2:1);if(_bell!=null)Grid.SetColumn(_bell,wrap?3:2);_top.RowSpacing=wrap?8:0;}
    void ShowNotifications(){if(_bell==null)return;foreach(var n in _context.State.Notifications.OfType<JsonObject>())n["unread"]=false;var popup=new Flyout{Content=new ScrollViewer{Content=Col(10,Heading("通知",13),NotificationsPage()),MaxHeight=480,Width=340,HorizontalScrollBarVisibility=Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled}};popup.ShowAt(_bell);}
    static bool B(JsonNode? n,string key)=>n is JsonObject o&&o[key] is JsonValue value&&value.TryGetValue<bool>(out var b)&&b;
    Control Face(string name,double size)
    {
        var user=UserByName(name);var id=T(user,"id",name);uint hash=0;foreach(var c in id)hash=unchecked(hash*31+c);var hue=hash%360;var chroma=(1-Math.Abs(2*.55-1))*.65;var x=chroma*(1-Math.Abs(hue/60d%2-1));var m=.55-chroma/2;var (r,g,b)=hue switch{<60=>(chroma,x,0d),<120=>(x,chroma,0d),<180=>(0d,chroma,x),<240=>(0d,x,chroma),<300=>(x,0d,chroma),_=>(chroma,0d,x)};var color=Color.FromRgb((byte)Math.Round((r+m)*255),(byte)Math.Round((g+m)*255),(byte)Math.Round((b+m)*255)).ToString();
        var placeholder=(Border)Mark(Initial(name),color,size);placeholder.CornerRadius=new CornerRadius(999);((TextBlock)placeholder.Child!).Foreground=Brush("#FFFFFF");
        var version=T(user,"icon");if(version.Length==0)return placeholder;
        var image=(Image)MessageImage("/icon?name="+Uri.EscapeDataString(name)+"&v="+Uri.EscapeDataString(version));image.Width=size;image.Height=size;image.Stretch=Stretch.UniformToFill;
        var layers=new Grid();layers.Children.Add(placeholder);layers.Children.Add(image);return new Border{Width=size,Height=size,CornerRadius=new CornerRadius(999),ClipToBounds=true,Child=layers};
    }
    Button BtnFace(string name,Action action){var b=Btn("",action);b.Content=Face(name,36);b.Padding=default;b.Background=Brushes.Transparent;return b;}
    static Button Link(string text,Action action){var b=Btn(text,action);b.Background=Brushes.Transparent;b.BorderThickness=default;b.Padding=default;b.FontWeight=FontWeight.Bold;b.HorizontalContentAlignment=HorizontalAlignment.Left;return b;}
    static Button Btn(string text,Action action,bool primary=false){var b=new Button{Content=text,FontFamily=Ui.BodyFont,FontSize=14,Padding=new Thickness(14,0),Height=36,CornerRadius=new CornerRadius(10),Background=Brush(primary?Accent:"#FFFFFF"),Foreground=Brush(primary?"#FFFFFF":Ink),FontWeight=primary?FontWeight.Bold:FontWeight.Normal,BorderBrush=Brush(primary?Accent:Line),BorderThickness=new Thickness(1),VerticalAlignment=VerticalAlignment.Center};b.Click+=(_,_)=>action();return b;}
    static Button SmallButton(string text,Action action){var b=Btn(text,action);b.Height=30;b.Padding=new Thickness(10,0);b.FontSize=12;b.CornerRadius=new CornerRadius(9);return b;}
    static Button TextLink(string text,Action action){var b=Btn(text,action);b.Height=24;b.FontSize=12;b.Padding=new Thickness(4,0);b.Background=Brushes.Transparent;b.BorderThickness=default;b.Content=new TextBlock{Text=text,FontFamily=Ui.BodyFont,FontSize=12,FontWeight=FontWeight.SemiBold,Foreground=Brush(Accent),TextDecorations=TextDecorations.Underline};return b;}
    static Control ActionSection(string title,string sub,string actionLabel,Action action){var grid=new Grid{ColumnDefinitions=new ColumnDefinitions("*,Auto"),ColumnSpacing=10};grid.Children.Add(Section(title,sub));var button=IconTextButton("plus",actionLabel,action,14);button.Background=Brush(Ink);button.Foreground=Brush("#FFFFFF");button.Content=IconLabel("plus",actionLabel,14,"#FFFFFF");Grid.SetColumn(button,1);grid.Children.Add(button);return grid;}
    static Control Section(string title,string sub="",Action? action=null,string more="すべて"){var g=new Grid{ColumnDefinitions=new ColumnDefinitions("*,Auto"),ColumnSpacing=10};var labels=new WrapPanel{ItemSpacing=10,LineSpacing=4};labels.Children.Add(Heading(title,17));if(sub.Length>0)labels.Children.Add(Text(sub,12,Muted));g.Children.Add(labels);if(action!=null){var b=TextLink(more,action);Grid.SetColumn(b,1);g.Children.Add(b);}return g;}
    static Control Empty(string title,string explanation="")=>new Border{Background=Brush("#DBFFFDF9"),CornerRadius=new CornerRadius(14),Padding=new Thickness(16,14),Child=Text(title+(explanation.Length>0?"\n"+explanation:""),13,Muted)};
}

/// <summary>Same auto-fill/minmax card sizing as the web client's CSS grid.</summary>
internal sealed class HomeCardGrid(double minimum,double gap):Panel
{
    private int columns=1;
    private double cellWidth;
    private readonly List<double> rowHeights=[];
    protected override Size MeasureOverride(Size available)
    {
        var width=double.IsInfinity(available.Width)?minimum:Math.Max(0,available.Width);
        columns=Math.Max(1,(int)Math.Floor((width+gap)/(minimum+gap)));cellWidth=Math.Max(0,(width-gap*(columns-1))/columns);rowHeights.Clear();
        for(var i=0;i<Children.Count;i++){var row=i/columns;if(rowHeights.Count<=row)rowHeights.Add(0);Children[i].Measure(new Size(cellWidth,double.PositiveInfinity));rowHeights[row]=Math.Max(rowHeights[row],Children[i].DesiredSize.Height);}
        return new Size(width,rowHeights.Sum()+Math.Max(0,rowHeights.Count-1)*gap);
    }
    protected override Size ArrangeOverride(Size final)
    {
        var y=0d;for(var row=0;row<rowHeights.Count;row++){for(var col=0;col<columns;col++){var index=row*columns+col;if(index>=Children.Count)break;Children[index].Arrange(new Rect(col*(cellWidth+gap),y,cellWidth,rowHeights[row]));}y+=rowHeights[row]+gap;}return final;
    }
}

internal sealed class HomeGround:Control
{
    public override void Render(DrawingContext context)
    {
        WebGround.Draw(context, Bounds.Size);
    }
}
