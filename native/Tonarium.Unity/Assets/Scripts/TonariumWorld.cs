using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.Video;

namespace Tonarium.UnityClient
{
    public sealed partial class TonariumWorld : MonoBehaviour
    {
        DesktopBridge bridge;
        Camera eye;
        CharacterController controller;
        GameObject environment;
        readonly Dictionary<string, GameObject> avatars = new Dictionary<string, GameObject>();
        readonly Dictionary<string, JObject> avatarStates = new Dictionary<string, JObject>();
        readonly Dictionary<string, GameObject> itemObjects = new Dictionary<string, GameObject>();
        readonly Dictionary<string, JObject> items = new Dictionary<string, JObject>();
        readonly Dictionary<int, GameObject> tiles = new Dictionary<int, GameObject>();
        readonly Dictionary<int, long> brokenTiles = new Dictionary<int, long>();
        readonly List<string> chat = new List<string>();
        JArray users = new JArray();
        JObject presence = new JObject();
        JObject game = new JObject();
        string selfId = "preview", sessionId = "", playerName = "あなた", world = "", serverUrl = "http://localhost:3000";
        string selected, carrying, held, draft = "", noteDraft = "", notice = "";
        bool menu, chatOpen, initialPosition, returnSent, embedded;
        float yaw, pitch, vertical, nextSend;
        Vector3 lastSentPosition = Vector3.positiveInfinity;
        float lastSentYaw, lastSentPitch;
        int lastSentJump;
        bool lastInputLocked;
        bool lastRelativeInput;
        WindowsRelativePointer relativePointer;
        WindowsMediaInput mediaInput;
        IntPtr pointerWindow;
        string pointerInitializationError;
        public Vector2 PointerDelta { get; private set; }
        public bool RelativePointerActive => relativePointer != null && relativePointer.IsActive;
        public long PointerPackets => relativePointer == null ? 0 : relativePointer.PacketsReceived;
        public string PointerError => relativePointer == null ? pointerInitializationError : relativePointer.LastError;
        string canvasStroke, canvasItem;
        readonly List<float> canvasPoints = new List<float>();
        readonly Dictionary<string, int> canvasEchoes = new Dictionary<string, int>();
        float canvasSendAt;
        Vector2 lastCanvasPoint;
        int jumps, round = -1, stepped = -1;
        Font font;
        GUIStyle labelStyle, titleStyle, bodyStyle, buttonStyle;
        Texture2D panelTexture;
        double serverOffset;
        public string WorldKind => world;
        public int AvatarCount => avatars.Count;
        public int ItemCount => items.Count;
        public int VideoScreenCount => liveScreens.Count;
        public Vector3 PlayerPosition => controller.transform.position;
        public bool IsBridgeConnected => bridge.Connected;

        void Awake()
        {
            Application.targetFrameRate = 60;
            QualitySettings.vSyncCount = 1;
            font = Resources.Load<Font>("Web/Fonts/ZenKakuGothicNew-Regular") ?? Font.CreateDynamicFontFromOSFont(new[] { "Yu Gothic UI", "Meiryo", "Segoe UI" }, 18);
            bridge = gameObject.AddComponent<DesktopBridge>();
            bridge.Message += Receive;
            var player = new GameObject("Player");
            controller = player.AddComponent<CharacterController>();
            controller.height = 1.6f; controller.center = Vector3.up * .8f;
            controller.radius = .3f; controller.stepOffset = .25f;
            player.transform.position = new Vector3(0, .05f, -6.5f);
            var cameraObject = new GameObject("View"); cameraObject.transform.SetParent(player.transform);
            cameraObject.transform.localPosition = new Vector3(0, 1.6f, 0);
            eye = cameraObject.AddComponent<Camera>(); eye.fieldOfView = 70; eye.nearClipPlane = .05f; eye.farClipPlane = 100;
            cameraObject.AddComponent<AudioListener>();
            yaw = 0;
            controller.transform.rotation = Quaternion.Euler(0, yaw, 0);
            BuildWorld("cafe");
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TONARIUM_INPUT_DIAGNOSTICS"))) gameObject.AddComponent<InputDiagnostics>();
            foreach (string arg in Environment.GetCommandLineArgs())
            {
                if (arg == "--tonarium-hud-probe") gameObject.AddComponent<HudInputProbe>();
                if (arg == "--tonarium-smoke") gameObject.AddComponent<SmokeCheck>();
                if (arg == "--tonarium-embedded") embedded = true;
                if (arg == "--tonarium-avatar-parity") gameObject.AddComponent<AvatarParityProbe>();
                if (arg == "--tonarium-item-parity") gameObject.AddComponent<ItemParityProbe>();
                if (arg == "--tonarium-canvas-perf") gameObject.AddComponent<CanvasPerformanceProbe>();
                if (arg == "--tonarium-chess-probe") gameObject.AddComponent<ChessInteractionProbe>();
                if (arg == "--tonarium-item-behavior") gameObject.AddComponent<ItemBehaviorProbe>();
                if (arg == "--tonarium-media-playback") gameObject.AddComponent<MediaPlaybackProbe>();
            }
        }

        void Receive(JObject m)
        {
            string type = (string)m["t"];
            if (type == "notice") { notice = (string)m["text"] ?? ""; return; }
            if (type == "nativeChatClosed") { chatOpen = false; Unlock(); return; }
            if (type == "nativeItems") { SetNativeOpenItems(m["ids"] as JArray); return; }
            if(type=="pointerWindow")
            {
                relativePointer?.Dispose();relativePointer=null;
                pointerWindow=new IntPtr((long?)m["hwnd"]??0);
                mediaInput?.Dispose(); mediaInput = null;
                WindowsMediaInput.TryCreate(pointerWindow, paths => bridge.Send(new { t = "dropMedia", paths }), out mediaInput);
                if(!WindowsRelativePointer.TryCreate(out relativePointer,pointerWindow))pointerInitializationError=WindowsRelativePointer.LastCreateError;
                if(!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TONARIUM_INPUT_DIAGNOSTICS")))Debug.Log("TONARIUM_POINTER_INIT "+(relativePointer!=null?"ready":pointerInitializationError));
                return;
            }
            if (type == "releaseInput") { EndCanvasStroke(); EndNoteEditing(); menu = false; Unlock(); return; }
            if (type == "videoFrame") { ReceiveVideo(m); return; }
            if (type == "resize")
            {
                uiScale=Mathf.Clamp((float?)m["scale"]??1,1,4);
                int width = Mathf.Clamp((int?)m["width"] ?? Screen.width, 160, 8192);
                int height = Mathf.Clamp((int?)m["height"] ?? Screen.height, 160, 8192);
                if (Screen.width != width || Screen.height != height)
                {
                    Debug.Log("TONARIUM_RESIZE " + Screen.width + "x" + Screen.height + " -> " + width + "x" + height);
                    Screen.SetResolution(width, height, FullScreenMode.Windowed);
                }
                return;
            }
            if (type == "snapshot")
            {
                selfId = (string)m["selfId"] ?? selfId; playerName = (string)m["name"] ?? playerName;
                sessionId = (string)m["sessionId"] ?? sessionId;
                serverUrl = ((string)m["serverUrl"] ?? serverUrl).TrimEnd('/');
                users = m["users"] as JArray ?? new JArray(); presence = m["presence"] as JObject ?? new JObject();
                if (m["now"] != null) serverOffset = (double)m["now"] - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                BuildWorld((string)m["world"] ?? "room");
                if (m["avatars"] is JObject initialAvatars)
                    foreach (var prop in initialAvatars.Properties()) ApplyAvatar(prop.Name, prop.Value as JObject);
                if (m["items"] is JObject itemMap)
                    foreach (var prop in itemMap.Properties()) ApplyItem(prop.Value as JObject);
                else if (m["items"] is JArray itemList)
                    foreach (var item in itemList.OfType<JObject>()) ApplyItem(item);
                chat.Clear();
                if (m["chats"] is JArray chats)
                    foreach (var c in chats.OfType<JObject>()) AddChat(c);
                ApplyGame(m["game"] as JObject);
                SyncUsers();
                return;
            }
            if (type == "shutdown") { ReturnTo2D(); Application.Quit(); return; }
            if (type == "teleport")
            {
                controller.enabled = false; controller.transform.position = Position(m) + Vector3.up * .05f; controller.enabled = true;
                yaw = -Float(m, "ry") * Mathf.Rad2Deg; return;
            }
            if (type == "desktopDisconnected") { notice = "2D クライアントとの接続が切れました"; if(embedded)Application.Quit(); return; }
            if (type == "users") { users = m["list"] as JArray ?? users; SyncUsers(); }
            if (type == "presence") { presence = m["all"] as JObject ?? presence; SyncUsers(); }
            if (type == "avatar") ApplyAvatar((string)m["id"], m["s"] as JObject);
            if (type == "avatarRemove") RemoveAvatar((string)m["id"]);
            if (type == "item") ApplyItem(m["item"] as JObject);
            if (type == "itemRemove") RemoveItem((string)m["id"]);
            if (type == "chat") AddChat(m["m"] as JObject);
            if (type == "world") { initialPosition = false; BuildWorld((string)m["world"] ?? "room"); }
            if (type == "worldPending") notice = "ワールドを切り替えます…";
            if (type == "game") ApplyGame(m["game"] as JObject);
            if (type == "gameTile") brokenTiles[(int)m["tile"]] = (long)m["at"];
            if (type == "itemAction") ApplyDelta(m);
        }

        void ApplyDelta(JObject message)
        {
            var id = (string)message["id"];
            if (id == null || !items.TryGetValue(id, out var item)) return;
            var a = message["action"] as JObject;
            if (a == null || (string)item["kind"] != "canvas") return;
            string action = (string)a["a"], echoKey = id + ":" + ((string)a["id"] ?? action);
            // 手元で先に描いた差分は、デスクトップ側から戻っても重ねて適用しない。
            if ((string)message["by"] == selfId && canvasEchoes.TryGetValue(echoKey, out int pending))
            {
                if (pending <= 1) canvasEchoes.Remove(echoKey); else canvasEchoes[echoKey] = pending - 1;
                return;
            }
            JObject stroke = null; int firstPoint = 0; bool rebuild = false;
            if (action == "canvasClear") item["strokes"] = new JArray();
            else if (action == "strokeStart")
            {
                if (!(item["strokes"] is JArray)) item["strokes"] = new JArray();
                stroke = new JObject { ["id"] = a["id"], ["by"] = message["by"] ?? selfId, ["color"] = a["color"], ["size"] = a["size"], ["pts"] = new JArray(a["x"], a["y"]) };
                ((JArray)item["strokes"]).Add(stroke);
                if (((JArray)item["strokes"]).Count > 3000) { ((JArray)item["strokes"]).RemoveAt(0); rebuild = true; }
            }
            else if (action == "strokeAdd" && item["strokes"] is JArray strokes)
            {
                string by = (string)message["by"] ?? selfId;
                stroke = strokes.OfType<JObject>().LastOrDefault(s => (string)s["id"] == (string)a["id"] && ((string)s["by"] ?? by) == by);
                if (stroke?["pts"] is JArray points && a["pts"] is JArray incoming)
                {
                    firstPoint = points.Count;
                    foreach (var p in incoming) points.Add(p.DeepClone());
                }
            }
            else return;
            if (itemObjects.TryGetValue(id, out var root) && root.GetComponentInChildren<ItemPanelSurface>() is ItemPanelSurface surface)
            {
                if (rebuild) PaintCanvas(surface, item);
                else PaintCanvasDelta(surface, item, stroke, firstPoint, action == "canvasClear");
            }
            else ApplyItem(item);
        }

        void SendCanvasAction(string id, JObject action, bool apply = true)
        {
            if (apply) ApplyDelta(new JObject { ["id"] = id, ["action"] = action });
            if (bridge.Connected)
            {
                string key = id + ":" + ((string)action["id"] ?? (string)action["a"]);
                canvasEchoes.TryGetValue(key, out int pending); canvasEchoes[key] = pending + 1;
            }
            Room(new { t = "itemAction", id, action });
        }

        void AddChat(JObject m)
        {
            if (m == null) return;
            RecordAvatarChat(m);
            RecordDiceChat(m);
            chat.Add(((string)m["fromName"] ?? "お知らせ") + "  " + (string)m["text"]);
            if (chat.Count > 50) chat.RemoveAt(0);
        }

        void ApplyAvatar(string id, JObject state)
        {
            if (string.IsNullOrEmpty(id) || state == null) return;
            avatarStates[id] = state;
            if (id == selfId)
            {
                if (!initialPosition)
                {
                    controller.enabled = false;
                    controller.transform.position = Position(state) + Vector3.up * .05f;
                    controller.enabled = true;
                    yaw = -Float(state, "ry") * Mathf.Rad2Deg;
                    initialPosition = true;
                }
                return;
            }
            if (!avatars.ContainsKey(id)) CreateAvatar(id);
        }

        void SyncUsers()
        {
            var valid = new HashSet<string>();
            foreach (var user in users.OfType<JObject>())
            {
                var id = (string)user["id"];
                if (string.IsNullOrEmpty(id) || id == selfId || (string)user["session"] != sessionId) continue;
                valid.Add(id);
                if (!avatars.ContainsKey(id)) CreateAvatar(id);
                var text = avatars[id].GetComponentInChildren<TextMesh>();
                if (text != null) text.text = (string)user["name"] + ((string)user["mode"] == "2d" ? " · 2D" : "");
                var pos = presence[id]?["pos"] as JObject;
                if ((string)user["mode"] == "2d" && pos != null) avatarStates[id] = pos;
            }
            foreach (var id in avatars.Keys.ToArray()) if (!valid.Contains(id)) RemoveAvatar(id);
        }

        void CreateAvatar(string id)
        {
            var root = new GameObject("Avatar " + id);
            var user = users.OfType<JObject>().FirstOrDefault(u => (string)u["id"] == id);
            string name = (string)user?["name"] ?? id;
            root.transform.position = new Vector3((avatars.Count % 5 - 2) * .8f, 0, -6.5f);
            if(avatarStates.TryGetValue(id,out var initial)){root.transform.position=Position(initial);root.transform.rotation=Quaternion.Euler(0,-Float(initial,"ry")*Mathf.Rad2Deg,0);}
            var model = OekakiModel.Create(root.transform);
            avatars[id] = root;
            root.AddComponent<WorldTarget>().Id = "user:" + id;
            var collider = root.AddComponent<CapsuleCollider>(); collider.height = 1.3f; collider.center = Vector3.up * .65f; collider.radius = .35f;
            StartCoroutine(LoadAvatar(model, name, (string)user?["avatar"]));
        }

        IEnumerator LoadAvatar(GameObject model, string name, string version)
        {
            string url = serverUrl + (string.IsNullOrEmpty(version) ? "/oekaki/sample.png" : "/avatar?name=" + UnityWebRequest.EscapeURL(name) + "&v=" + version);
            using (var request = UnityWebRequestTexture.GetTexture(url))
            {
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success || model == null) yield break;
                var texture = DownloadHandlerTexture.GetContent(request);
                model.GetComponent<OekakiModel>().ApplyTexture(texture);
            }
            if (!string.IsNullOrEmpty(version))
                using (var request = UnityWebRequest.Get(serverUrl + "/avatar/params?name=" + UnityWebRequest.EscapeURL(name) + "&v=" + version))
                {
                    yield return request.SendWebRequest();
                    if (request.result == UnityWebRequest.Result.Success && model != null)
                    {
                        JObject parameters = null;
                        try { parameters = JObject.Parse(request.downloadHandler.text); } catch (Exception) { }
                        if (parameters != null) model.GetComponent<OekakiModel>().ApplyParameters(parameters);
                    }
                }
        }

        void RemoveAvatar(string id)
        {
            if (id == null) return;
            if (avatars.TryGetValue(id, out var avatar)) Destroy(avatar);
            avatars.Remove(id); avatarStates.Remove(id);
        }

        void ApplyGame(JObject value)
        {
            if (value == null) return;
            game = value;
            if (value["tiles"] is JObject tileMap) foreach (var t in tileMap.Properties()) if (int.TryParse(t.Name, out int n)) brokenTiles[n] = (long)t.Value;
            int newRound = (int?)value["round"] ?? 0;
            var players = value["players"] as JArray;
            int index = players == null ? -1 : players.ToList().FindIndex(p => (string)p["id"] == selfId);
            if (newRound != round && (string)value["phase"] == "running" && index >= 0)
            {
                round = newRound; stepped = -1; brokenTiles.Clear();
                foreach (var t in tiles.Values) t.SetActive(true);
                int tile = (index * 27 + 9) % 64;
                controller.enabled = false; controller.transform.position = ToUnity(TilePosition(tile)) + Vector3.up * .1f; controller.enabled = true;
            }
        }

        void Update()
        {
            PointerDelta = Vector2.zero;
            ValidateChessSelection();
            if (!string.IsNullOrEmpty(Input.compositionString)) lastCompositionFrame = Time.frameCount;
            if (Input.GetKeyDown(KeyCode.Escape)) { chatOpen = false; EndCanvasStroke(); EndNoteEditing(); ClearChessSelection(); menu = false; Unlock(); }
            if (Input.GetKeyDown(KeyCode.F2)) ReturnTo2D();
            if (Input.GetKeyDown(KeyCode.Return) && !chatOpen && !menu && selected == null && chessPromotionTo < 0)
            {
                if (embedded) { Unlock(); bridge.Send(new {t="focusChat"}); }
                else { chatOpen = true; chatOpenedFrame = Time.frameCount; Unlock(); }
            }
            if(selected!=null&&items.TryGetValue(selected,out var selectedItem)&&(string)selectedItem["kind"]=="note"&&Input.GetMouseButtonDown(0))
            {
                var point=new Vector2(Input.mousePosition.x/uiScale,(Screen.height-Input.mousePosition.y)/uiScale);
                float width=Mathf.Min(480,HudWidth-32);
                if(!new Rect((HudWidth-width)/2,HudHeight-296,width,186).Contains(point))EndNoteEditing();
            }
            bool controls = !menu && !chatOpen && selected == null && chessPromotionTo < 0;
            if (embedded && controls && Input.GetKeyDown(KeyCode.Tab)) bridge.Send(new { t = "toggleSidePanels" });
            if (embedded && controls && (Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.RightControl)) && Input.GetKeyDown(KeyCode.V)) bridge.Send(new { t = "pasteMedia" });
            bool justLocked = Time.frameCount <= pointerLockedFrame + 1;
            if (controls && Cursor.lockState == CursorLockMode.Locked)
            {
                Vector2 delta;
                if(relativePointer!=null)
                {
                    if(!relativePointer.TryConsume(out delta))delta=Vector2.zero;
                    delta=new Vector2(delta.x*.1f,-delta.y*.1f);
                }
                else delta=new Vector2(Input.GetAxisRaw("Mouse X"),Input.GetAxisRaw("Mouse Y"));
                // クリックから中央固定へ移るフレームは、座標移動を視点回転へ混ぜない。
                if(justLocked)delta=Vector2.zero;
                PointerDelta=delta;
                yaw += delta.x * 1.4324f; pitch = Mathf.Clamp(pitch - delta.y * 1.4324f, -80.214f, 80.214f);
                controller.transform.rotation = Quaternion.Euler(0, yaw, 0); eye.transform.localRotation = Quaternion.Euler(pitch, 0, 0);
                var move = controller.transform.forward * Input.GetAxisRaw("Vertical") + controller.transform.right * Input.GetAxisRaw("Horizontal");
                move = Vector3.ClampMagnitude(move, 1) * 4;
                if (controller.isGrounded && vertical < 0) vertical = -2;
                if (controller.isGrounded && Input.GetKeyDown(KeyCode.Space)) { vertical = 4.2f; jumps++; }
                vertical -= 12 * Time.deltaTime;
                controller.Move((move + Vector3.up * vertical) * Time.deltaTime);
                if (Input.GetKeyDown(KeyCode.E) || (!justLocked && Input.GetMouseButtonDown(0))) Interact();
                if (canvasStroke != null && Input.GetMouseButton(0)) ContinueCanvasStroke();
                if (canvasStroke != null && Input.GetMouseButtonUp(0)) EndCanvasStroke();
                if (Input.GetMouseButtonDown(1)) ToggleCarry();
                if (Input.GetKeyDown(KeyCode.Q) && held != null) DropHeld();
                if (Input.GetKeyDown(KeyCode.C) && AimedCamera() is string photoCamera) StartCoroutine(TakeItemPhoto(photoCamera));
                if (Input.GetKeyDown(KeyCode.L))
                {
                    string id=held;if(id==null&&Aim(out var cameraTarget))id=cameraTarget.Id;
                    if(id!=null&&items.TryGetValue(id,out var cam)&&(string)cam["kind"]=="camera")Room(new {t="itemAction",id,action=new {a="camLive",on=(bool?)cam["live"]!=true}});
                }
                if (Input.GetKeyDown(KeyCode.X) && Aim(out var target) && !target.Id.StartsWith("user:")) Room(new { t = "itemRemove", id = target.Id });
            }
            var currentPosition=controller.transform.position;
            if ((Time.time >= nextSend && ((currentPosition-lastSentPosition).sqrMagnitude>.0001f || Mathf.Abs(yaw-lastSentYaw)>.573f || Mathf.Abs(pitch-lastSentPitch)>1.719f)) || jumps!=lastSentJump)
            {
                nextSend = Time.time + .033f;
                var p = controller.transform.position;
                Room(new { t = "avatar", s = new { x = p.x, z = -p.z, y = p.y, ry = -yaw * Mathf.Deg2Rad, pitch = -pitch * Mathf.Deg2Rad, jump = jumps } });
                lastSentPosition=p;lastSentYaw=yaw;lastSentPitch=pitch;lastSentJump=jumps;
                if (carrying != null)
                {
                    var pos = controller.transform.position + controller.transform.forward * 2;
                    pos.y = 0;
                    if(itemObjects.TryGetValue(carrying,out var carried))carried.transform.position=pos;
                    SendCarry(pos);
                }
            }
            foreach (var pair in avatars)
                if (avatarStates.TryGetValue(pair.Key, out var state) && (string)users.OfType<JObject>().FirstOrDefault(u=>(string)u["id"]==pair.Key)?["mode"]!="2d")
                {
                    pair.Value.transform.position = Vector3.Lerp(pair.Value.transform.position, Position(state), Time.deltaTime * 15);
                    pair.Value.transform.rotation = Quaternion.Slerp(pair.Value.transform.rotation, Quaternion.Euler(0, -Float(state, "ry") * Mathf.Rad2Deg, 0), Time.deltaTime * 15);
                }
            UpdateAvatarPresentation();
            foreach (var pair in items)
            {
                string holder = (string)pair.Value["holder"];
                if (holder != null && itemObjects.TryGetValue(pair.Key, out var obj))
                {
                    var anchor = holder == selfId ? controller.transform : avatars.TryGetValue(holder, out var avatar) ? avatar.transform : null;
                    if (anchor != null)
                    {
                        bool firstPerson=holder==selfId;bool hammer=(string)pair.Value["kind"]=="hammer";
                        obj.transform.position = firstPerson ? eye.transform.TransformPoint(new Vector3(.26f,-.3f,.6f)) : anchor.TransformPoint(new Vector3(.32f,.6f,.1f));
                        obj.transform.rotation = firstPerson ? eye.transform.rotation*Quaternion.Euler(-17,0,8.6f) : anchor.rotation*Quaternion.Euler(-23,0,0);
                        obj.transform.localScale=Vector3.one*(firstPerson&&hammer?.38f:1);
                        foreach(var collider in obj.GetComponentsInChildren<Collider>())collider.enabled=!firstPerson;
                    }
                }
            }
            foreach (var pair in brokenTiles) if (pair.Value <= Now && tiles.TryGetValue(pair.Key, out var tile)) tile.SetActive(false);
            UpdateVideoScreens();
            UpdateCameraCapture();
            bool locked=Cursor.lockState==CursorLockMode.Locked;
            bool relativeInput=RelativePointerActive;
            if(locked!=lastInputLocked||relativeInput!=lastRelativeInput)
            {
                lastInputLocked=locked;lastRelativeInput=relativeInput;
                bridge.Send(new {t="inputState",locked,relativeInput});
                if(!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TONARIUM_INPUT_DIAGNOSTICS")))Debug.Log("TONARIUM_POINTER_STATE locked="+locked+" relative="+relativeInput);
            }
            if (world == "game" && (string)game["phase"] == "running")
            {
                if (controller.transform.position.y < -8)
                {
                    Room(new { t = "gameFell" }); controller.enabled = false; controller.transform.position = new Vector3(0, .1f, -6.5f); controller.enabled = true;
                }
                else if (Physics.Raycast(controller.transform.position + Vector3.up * .1f, Vector3.down, out var hit, .3f))
                {
                    var tile = hit.collider.GetComponent<GameTile>();
                    if (tile != null && tile.Index != stepped) { stepped = tile.Index; Room(new { t = "gameStep", tile = tile.Index }); }
                }
            }
        }

        bool Aim(out WorldTarget target)
        {
            target = null;
            if (!Physics.Raycast(eye.transform.position, eye.transform.forward, out var hit, 30)) return false;
            target = hit.collider.GetComponentInParent<WorldTarget>();
            return target != null;
        }
        int chessFrom = -1;
        string chessItem;
        int chessRevision = -1;
        int chessPromotionTo = -1;

        void ClearChessSelection()
        {
            chessFrom = -1; chessItem = null; chessRevision = -1; chessPromotionTo = -1; notice = "";
        }

        void ValidateChessSelection()
        {
            if (chessItem != null && (!items.TryGetValue(chessItem, out var item) || ((int?)item["chess"]?["revision"] ?? 0) != chessRevision)) ClearChessSelection();
        }

        void CompleteChessPromotion(string promotion)
        {
            if (promotion != "q" && promotion != "r" && promotion != "b" && promotion != "n") return;
            ValidateChessSelection();
            if (chessPromotionTo < 0 || chessFrom < 0 || chessItem == null) return;
            Room(new JObject { ["t"] = "itemAction", ["id"] = chessItem, ["action"] = new JObject
            { ["a"] = "chessMove", ["from"] = chessFrom, ["to"] = chessPromotionTo, ["revision"] = chessRevision, ["promotion"] = promotion } });
            ClearChessSelection();
        }

        void InteractChessSquare(string id, JObject item, int square)
        {
            int revision = (int?)item["chess"]?["revision"] ?? 0;
            var board = item["board"] as JArray;
            if (square < 0 || square >= 64 || board == null || board.Count != 64 || revision < 0) return;
            string piece = (string)board[square];
            var fen = ((string)item["chess"]?["fen"] ?? "").Split(' ');
            char turn = fen.Length > 1 && fen[1] == "b" ? 'b' : 'w';
            if ((string)item["kind"] == "chessAi" && turn == 'b') { ClearChessSelection(); return; }
            bool ownPiece = !string.IsNullOrEmpty(piece) && piece[0] == turn;
            if (chessItem != id || chessRevision != revision) ClearChessSelection();
            if (chessFrom < 0 || ownPiece)
            {
                chessItem = id; chessRevision = revision; chessFrom = ownPiece ? square : -1;
                notice = chessFrom >= 0 ? "移動先のマスをクリック" : "手番の駒をクリック";
                return;
            }
            var action = new JObject { ["a"] = "chessMove", ["from"] = chessFrom, ["to"] = square, ["revision"] = revision };
            string moving = (string)board[chessFrom];
            // 昇格は駒を選んでから送り、選択中に盤が更新されたら取り消す。
            if (moving == "wP" && square / 8 == 0 || moving == "bP" && square / 8 == 7)
            {
                chessPromotionTo = square; notice = "昇格する駒を選んでください"; Unlock(); return;
            }
            Room(new JObject { ["t"] = "itemAction", ["id"] = id, ["action"] = action });
            ClearChessSelection();
        }
        void Interact()
        {
            if(carrying!=null){FinishCarry();return;}
            if(held!=null&&items.TryGetValue(held,out var heldItem)&&(string)heldItem["kind"]=="camera"){StartCoroutine(TakeItemPhoto(held));return;}
            if (!Physics.Raycast(eye.transform.position, eye.transform.forward, out var hit, 30)) return;
            if (hit.collider.GetComponent<GameStart>() != null) { Room(new { t = "gameStart" }); return; }
            var target = hit.collider.GetComponentInParent<WorldTarget>(); if (target == null) return;
            if (target.Id.StartsWith("user:"))
            {
                if(held!=null && hit.distance<5)Room(new { t = "hit", to = target.Id.Substring(5) }); return;
            }
            if (!items.TryGetValue(target.Id, out var item)) return;
            if(TryCanvasPoint(hit,out var canvasId,out var point))
            {
                canvasItem=canvasId;canvasStroke=Guid.NewGuid().ToString();canvasSendAt=Time.unscaledTime;lastCanvasPoint=point;
                SendCanvasAction(canvasId, new JObject { ["a"]="strokeStart",["id"]=canvasStroke,["color"]=CanvasPenColor(canvasId),["size"]=CanvasPenSize(canvasId),["x"]=point.x,["y"]=point.y });
                return;
            }
            if(InteractItemSurface(target,hit))return;
            string kind = (string)item["kind"];
            if (kind == "hammer" || kind == "camera") { Room(new { t = "itemAction", id = target.Id, action = new { a = "pick" } }); return; }
            if (kind == "dice") { OpenDiceItem(target.Id); return; }
            if ((kind == "chess" || kind == "chessAi") && hit.collider.GetComponent<ChessSquare>() is ChessSquare square)
            {
                InteractChessSquare(target.Id, item, square.Index);
                return;
            }
            if (kind == "note") BeginNoteEditing(target.Id);
            else if (kind == "image") BeginImageViewing(target.Id);
            else OpenNativeItem(target.Id);
        }
        void ToggleCarry()
        {
            if (carrying != null) { FinishCarry(); return; }
            if (Aim(out var target))
            {
                if(target.Id.StartsWith("user:") && (string)users.OfType<JObject>().FirstOrDefault(u=>(string)u["id"]==target.Id.Substring(5))?["mode"]!="2d")return;
                carrying = target.Id;
                SendCarry(controller.transform.position+controller.transform.forward*2);
            }
        }
        void SendCarry(Vector3 position)
        {
            position.x=Mathf.Clamp(position.x,-9.5f,9.5f);position.z=Mathf.Clamp(position.z,-9.5f,9.5f);
            if(carrying.StartsWith("user:"))Room(new {t="place2d",target=carrying.Substring(5),pos=new{x=position.x,z=-position.z,ry=-yaw*Mathf.Deg2Rad+Mathf.PI}});
            else if(carrying.StartsWith("display:"))Room(new {t="displayMove",target=carrying.Substring(8),x=position.x,z=-position.z,ry=-yaw*Mathf.Deg2Rad});
            else Room(new{t="itemMove",id=carrying,x=position.x,z=-position.z,ry=-yaw*Mathf.Deg2Rad});
        }
        void FinishCarry(){if(carrying==null)return;SendCarry(controller.transform.position+controller.transform.forward*2);carrying=null;}

        void ContinueCanvasStroke()
        {
            if(!Physics.Raycast(eye.transform.position,eye.transform.forward,out var hit,30)||!TryCanvasPoint(hit,out var id,out var point)||id!=canvasItem)return;
            if(Vector2.Distance(lastCanvasPoint,point)<.5f)return;
            var stroke = (items[id]["strokes"] as JArray)?.LastOrDefault(s => (string)s["id"] == canvasStroke);
            if ((stroke?["pts"] as JArray)?.Count >= 8000) { FlushCanvasStroke(); return; }
            lastCanvasPoint=point;
            canvasPoints.Add(point.x);canvasPoints.Add(point.y);
            ApplyDelta(new JObject { ["id"]=canvasItem,["action"]=new JObject { ["a"]="strokeAdd",["id"]=canvasStroke,["pts"]=new JArray(point.x,point.y) } });
            if(Time.unscaledTime-canvasSendAt>=.05f)FlushCanvasStroke();
        }
        void FlushCanvasStroke()
        {
            if(canvasStroke!=null&&canvasPoints.Count>0)SendCanvasAction(canvasItem,new JObject { ["a"]="strokeAdd",["id"]=canvasStroke,["pts"]=new JArray(canvasPoints) },false);
            canvasPoints.Clear();canvasSendAt=Time.unscaledTime;
        }
        void EndCanvasStroke(){FlushCanvasStroke();canvasStroke=null;canvasItem=null;}
        void DropHeld()
        {
            float gap = items.TryGetValue(held, out var item) && (string)item["kind"] == "camera" ? .7f : 1.2f;
            var p = controller.transform.position + controller.transform.forward * gap;
            p.x = Mathf.Clamp(p.x, -9.5f, 9.5f); p.z = Mathf.Clamp(p.z, -9.5f, 9.5f);
            Room(new { t = "itemAction", id = held, action = new { a = "drop", x = p.x, z = -p.z, ry = -yaw * Mathf.Deg2Rad, pitch = -pitch * Mathf.Deg2Rad } }); held = null;
        }
        void Room(object value) => bridge.Send(new { t = "room", message = value });
        int pointerLockedFrame = -10;
        void LockPointer()
        {
            pointerLockedFrame = Time.frameCount;
            Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false;
            if(embedded && relativePointer==null && pointerWindow!=IntPtr.Zero && !WindowsRelativePointer.TryCreate(out relativePointer,pointerWindow))pointerInitializationError=WindowsRelativePointer.LastCreateError;
            if(relativePointer!=null&&!relativePointer.SetLocked(true))
            {
                pointerInitializationError=relativePointer.LastError??"Relative pointer registration did not activate";
            }
            if(!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TONARIUM_INPUT_DIAGNOSTICS")))Debug.Log("TONARIUM_POINTER "+(RelativePointerActive?"relative":"legacy")+" "+PointerError);
        }

        void Unlock() { EndCanvasStroke();FinishCarry();relativePointer?.SetLocked(false);Cursor.lockState = CursorLockMode.None; Cursor.visible = true; }
        void OnApplicationFocus(bool focused){if(!focused)Unlock();}
        void SendChat() { if (!string.IsNullOrWhiteSpace(draft)) Room(new { t = "chat", text = draft, scope = "all" }); draft = ""; }
        string AimedCamera()
        {
            if (held != null && items.TryGetValue(held, out var heldItem) && (string)heldItem["kind"] == "camera") return held;
            return Aim(out var target) && items.TryGetValue(target.Id, out var item) && (string)item["kind"] == "camera" ? target.Id : null;
        }
        public void ReturnTo2D() { if (returnSent) return; returnSent = true; EndNoteEditing(); Unlock(); bridge.Send(new { t = "return2d" }); if (!bridge.Connected) Application.Quit(); }
        void OnApplicationQuit() { ReturnTo2D(); }
        void OnDestroy() { mediaInput?.Dispose(); relativePointer?.Dispose(); DisposeCameraCapture(); }
        long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + (long)serverOffset;
        static Vector3 ToUnity(Vector3 p) => new Vector3(p.x, p.y, -p.z);
        static Vector3 Position(JObject p) => ToUnity(new Vector3(Float(p, "x"), Float(p, "y"), Float(p, "z")));
        static float Float(JObject o, string key, float fallback = 0) => (float?)o?[key] ?? fallback;
    }
    public sealed class WorldTarget : MonoBehaviour { public string Id; }
    public sealed class ChessSquare : MonoBehaviour { public int Index; }
    public sealed class GameTile : MonoBehaviour { public int Index; }
    public sealed class GameStart : MonoBehaviour { }
    public sealed class FaceCamera : MonoBehaviour
    {
        void LateUpdate()
        {
            if (Camera.allCameras.Length > 0) transform.rotation = Quaternion.LookRotation(transform.position - Camera.allCameras[0].transform.position);
        }
    }
}
