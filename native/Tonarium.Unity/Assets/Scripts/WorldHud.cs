using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Tonarium.UnityClient
{
    public sealed partial class TonariumWorld
    {
        readonly Dictionary<string, Texture2D> hudTextures = new Dictionary<string, Texture2D>();
        readonly Dictionary<string, GUIStyle> hudPanels = new Dictionary<string, GUIStyle>();
        float uiScale = 1, noteSentAt;
        string noteSent = "";
        float imageZoom = 1;
        Vector2 imageScroll;
        int lastCompositionFrame = -10, chatOpenedFrame = -10;
        float HudWidth => Screen.width / uiScale;
        float HudHeight => Screen.height / uiScale;

        void OnGUI()
        {
            GUI.matrix = Matrix4x4.Scale(Vector3.one * uiScale);
            if (labelStyle == null)
            {
                labelStyle = new GUIStyle(GUI.skin.label) { font=font,fontSize=13,richText=false,normal={textColor=Color.white} };
                titleStyle = new GUIStyle(labelStyle) {font=Resources.Load<Font>("Web/Fonts/ZenMaruGothic-Bold")??font,fontSize=20,fontStyle=FontStyle.Bold};
                bodyStyle = new GUIStyle(labelStyle) {wordWrap=true,normal={textColor=ColorValue("#26262e")}};
                buttonStyle = new GUIStyle(GUI.skin.button) {font=font,fontSize=13,padding=new RectOffset(12,12,5,5),border=new RectOffset(7,7,7,7),normal={textColor=ColorValue("#26262e"),background=HudTexture("#fffdf9")},hover={textColor=ColorValue("#2f5fc4"),background=HudTexture("#eef3fc")},active={textColor=ColorValue("#2f5fc4"),background=HudTexture("#e1e9f7")}};
                GUI.skin.font=font;GUI.skin.textArea.font=font;GUI.skin.textArea.fontSize=14;
                GUI.skin.textArea.normal.textColor=ColorValue("#1c1917");
                GUI.skin.textArea.normal.background=HudTexture("#fde68a");
            }
            bool locked=Cursor.lockState==CursorLockMode.Locked;
            if(!embedded)
            {
                if(GUI.Button(new Rect(20,20,44,44),"☰",buttonStyle)){menu=!menu;Unlock();}
                var logo=Resources.Load<Texture2D>("Web/Brand/mark");
                if(GUI.Button(new Rect(76,20,180,44),"",buttonStyle)){menu=!menu;Unlock();}
                if(logo!=null)GUI.DrawTexture(new Rect(83,26,30,30),logo,ScaleMode.ScaleToFit);
                GUI.Label(new Rect(121,25,126,32),WorldName(world),bodyStyle);
                if(GUI.Button(new Rect(HudWidth-128,20,108,36),"2D に戻る",buttonStyle))ReturnTo2D();
            }
            string help=locked?"WASD: 移動 ・ Space: ジャンプ ・ マウス: 視点 ・ クリック: 操作 ・ 右クリック: 運ぶ/置く ・ X: 片付ける ・ Esc: カーソルを出す":"画面をクリックすると操作を始めます（マウスで視点・照準で操作）";
            var helpStyle=new GUIStyle(labelStyle){fontSize=locked?12:15,alignment=TextAnchor.MiddleCenter,clipping=TextClipping.Clip};
            float helpWidth=Mathf.Min(helpStyle.CalcSize(new GUIContent(help)).x+32,HudWidth*.78f);
            var helpRect=new Rect((HudWidth-helpWidth)/2,locked?HudHeight-170:HudHeight/2,helpWidth,locked?28:40);
            if(!menu&&selected==null&&chessPromotionTo<0){HudPanel(helpRect,"#141418BD");GUI.Label(helpRect,help,helpStyle);}
            if(locked)
            {
                string hint=AimHint();bool active=!string.IsNullOrEmpty(hint);float diameter=active?18:10;
                GUI.DrawTexture(new Rect(HudWidth/2-diameter/2,HudHeight/2-diameter/2,diameter,diameter),HudReticle(active));
                if(active)
                {
                    float width=Mathf.Min(labelStyle.CalcSize(new GUIContent(hint)).x+24,HudWidth-24);
                    var rect=new Rect((HudWidth-width)/2,HudHeight/2+22,width,30);
                    HudPanel(rect,"#141418BF");GUI.Label(rect,hint,new GUIStyle(labelStyle){alignment=TextAnchor.MiddleCenter});
                }
            }
            if(held!=null&&items.TryGetValue(held,out var camera)&&(string)camera["kind"]=="camera")
            {
                float l=HudWidth*.1f,r=HudWidth*.9f,t=HudHeight*.08f,b=HudHeight*.92f;
                foreach(var point in new[]{new Vector2(l,t),new Vector2(r,t),new Vector2(l,b),new Vector2(r,b)})
                {
                    GUI.DrawTexture(new Rect(point.x==r?r-24:l,point.y,24,2),Texture2D.whiteTexture);
                    GUI.DrawTexture(new Rect(point.x,point.y==b?b-24:t,2,24),Texture2D.whiteTexture);
                }
                if((bool?)camera["live"]==true)GUI.Label(new Rect(l+12,t+12,180,28),"● LIVE 配信中",labelStyle);
            }
            if(!string.IsNullOrEmpty(notice))
            {
                var rect=new Rect(Mathf.Max(12,HudWidth/2-240),HudHeight-174,Mathf.Min(480,HudWidth-24),32);
                HudPanel(rect,"#26262eD9");GUI.Label(rect,notice,new GUIStyle(labelStyle){alignment=TextAnchor.MiddleCenter});
            }
            if(chatOpen&&!embedded)
            {
                var key = Event.current;
                // IMGUIがEnterを消費する前に処理し、IME確定と開いた直後のEnterは送信しない。
                if (key.type == EventType.KeyDown && (key.keyCode == KeyCode.Return || key.keyCode == KeyCode.KeypadEnter))
                {
                    if (Time.frameCount > chatOpenedFrame && Time.frameCount > lastCompositionFrame + 1 && string.IsNullOrEmpty(Input.compositionString))
                    { SendChat(); chatOpen = false; }
                    key.Use();
                }
                GUI.SetNextControlName("chat");draft=GUI.TextField(new Rect(20,HudHeight-88,HudWidth-120,38),draft);
                GUI.FocusControl("chat");if(GUI.Button(new Rect(HudWidth-90,HudHeight-88,70,38),"送信",buttonStyle)){SendChat();chatOpen=false;}
            }
            if(menu&&!embedded)MenuGUI();
            if(selected!=null&&items.TryGetValue(selected,out var item))ItemGUI(item);
            if(chessPromotionTo>=0)ChessPromotionGUI();
            // UIが消費しなかったクリックだけを視点操作へ渡す。
            if (Event.current.type == EventType.MouseDown && Event.current.button == 0
                && !menu && !chatOpen && selected == null && chessPromotionTo < 0 && Cursor.lockState != CursorLockMode.Locked)
            { LockPointer(); Event.current.Use(); }
        }

        void ChessPromotionGUI()
        {
            float width = Mathf.Min(420, HudWidth - 24), height = 214;
            var rect = new Rect((HudWidth - width) / 2, (HudHeight - height) / 2, width, height);
            HudPanel(rect, "#fffdf9");
            GUI.Label(new Rect(rect.x + 16, rect.y + 14, width - 32, 32), "昇格する駒を選んでください", new GUIStyle(titleStyle) { fontSize = 18, normal = { textColor = ColorValue("#26262e") } });
            string[] values = { "q", "r", "b", "n" }, names = { "クイーン", "ルーク", "ビショップ", "ナイト" };
            float gap = 10, buttonWidth = (width - 42) / 2;
            for (int i = 0; i < 4; i++)
                if (GUI.Button(new Rect(rect.x + 16 + (i % 2) * (buttonWidth + gap), rect.y + 58 + (i / 2) * 48, buttonWidth, 38), names[i], buttonStyle)) CompleteChessPromotion(values[i]);
            if (GUI.Button(new Rect(rect.x + width - 110, rect.y + 164, 94, 32), "取り消す", buttonStyle)) ClearChessSelection();
        }

        string AimHint()
        {
            if(carrying!=null)return "右クリック: ここに置く";
            if(held!=null&&items.TryGetValue(held,out var heldItem)&&(string)heldItem["kind"]=="camera")return "クリック: 撮影 ・ L: 配信 ・ Q: 三脚に置く";
            if(!Aim(out var target))return null;
            if(target.Id.StartsWith("user:"))
            {
                var user=users.OfType<JObject>().FirstOrDefault(u=>(string)u["id"]==target.Id.Substring(5));
                if(held!=null)return "クリック: "+(string)user?["name"]+" を叩く";
                return (string)user?["mode"]=="2d"?"2Dで参加中 ・ 右クリック: 運ぶ":null;
            }
            if(!items.TryGetValue(target.Id,out var item))return null;
            string kind=(string)item["kind"];
            return (kind=="canvas"?"クリック/ドラッグ: 描く":kind=="note"?"クリック: 付箋を書く":kind=="hammer"||kind=="camera"?"クリック: 手に持つ":kind=="dice"?"クリック: 振る":"クリック: 操作")+" ・ 右クリック: 運ぶ ・ X: 片付ける";
        }

        void MenuGUI()
        {
            float width=Mathf.Min(420,HudWidth-32),height=Mathf.Min(460,HudHeight-32);
            var rect=new Rect((HudWidth-width)/2,(HudHeight-height)/2,width,height);HudPanel(rect,"#fffdf9");
            GUILayout.BeginArea(new Rect(rect.x+20,rect.y+20,width-40,height-40));
            GUILayout.Label("セッションの設定",new GUIStyle(titleStyle){normal={textColor=ColorValue("#26262e")}});
            GUILayout.Space(12);GUILayout.BeginHorizontal();
            foreach(string kind in new[]{"room","cafe","game"})if(GUILayout.Button(WorldName(kind),buttonStyle)){Room(new{t="world",world=kind});if(!bridge.Connected)BuildWorld(kind);menu=false;}
            GUILayout.EndHorizontal();GUILayout.Space(18);
            foreach(string kind in new[]{"note","canvas","chess","chessAi","dice","hammer","camera","g2048"})
                if(GUILayout.Button(KindName(kind),buttonStyle)){var p=controller.transform.position+controller.transform.forward*2;Room(new{t="itemCreate",kind,x=p.x,z=-p.z,ry=-yaw*Mathf.Deg2Rad});menu=false;}
            if(GUILayout.Button("閉じる",buttonStyle))menu=false;
            GUILayout.EndArea();
        }

        void ItemGUI(JObject item)
        {
            if ((string)item["kind"] == "image") { ImageGUI(item); return; }
            if((string)item["kind"]!="note")
            {
                if(embedded)bridge.Send(new{t="openItem",id=selected});
                selected=null;return;
            }
            float width=Mathf.Min(480,HudWidth-32),height=186;
            var rect=new Rect((HudWidth-width)/2,HudHeight-height-110,width,height);HudPanel(rect,"#fffdf9");
            var noteStyle = new GUIStyle(GUI.skin.textArea);
            foreach (var state in new[] { noteStyle.normal, noteStyle.hover, noteStyle.active, noteStyle.focused })
            { state.background = HudTexture((string)item["color"] ?? "#fde68a"); state.textColor = ColorValue("#1c1917"); }
            string next=GUI.TextArea(new Rect(rect.x+12,rect.y+12,width-24,72),noteDraft,300,noteStyle);
            if(next!=noteDraft){noteDraft=next;noteSentAt=Time.unscaledTime;}
            if(noteDraft!=noteSent&&Time.unscaledTime-noteSentAt>.08f)CommitNote();
            float x=rect.x+12;
            foreach(string color in new[]{"#fde68a","#fca5a5","#86efac","#93c5fd","#d8b4fe"})
            {GUI.backgroundColor=ColorValue(color);if(GUI.Button(new Rect(x,rect.y+96,24,24),"",buttonStyle))Room(new{t="itemAction",id=selected,action=new{a="noteEdit",color}});x+=30;}
            GUI.backgroundColor=Color.white;
            if(GUI.Button(new Rect(x+4,rect.y+94,118,30),"こちらに向ける",buttonStyle)){var p=itemObjects[selected].transform.position;Room(new{t="itemMove",id=selected,x=p.x,z=-p.z,ry=-yaw*Mathf.Deg2Rad});}
            if(GUI.Button(new Rect(rect.x+width-76,rect.y+94,64,30),"閉じる",buttonStyle))EndNoteEditing();
            GUI.Label(new Rect(rect.x+12,rect.y+140,width-24,30),"空間をクリックすると操作に戻ります",new GUIStyle(bodyStyle){fontSize=12,normal={textColor=ColorValue("#5e5c64")}});
        }

        void BeginImageViewing(string id)
        {
            if (!items.TryGetValue(id, out var item) || (string)item["kind"] != "image") return;
            EndNoteEditing(); selected = id; imageZoom = 1; imageScroll = Vector2.zero; Unlock();
        }

        void ImageGUI(JObject item)
        {
            var rect = new Rect(24, 80, Mathf.Max(200, HudWidth - 48), Mathf.Max(160, HudHeight - 104));
            HudPanel(rect, "#26262eF2");
            GUI.Label(new Rect(rect.x + 12, rect.y + 8, 180, 30), "画像", labelStyle);
            if (GUI.Button(new Rect(rect.x + rect.width - 260, rect.y + 8, 48, 30), "−", buttonStyle)) imageZoom = Mathf.Max(1, imageZoom / 1.5f);
            if (GUI.Button(new Rect(rect.x + rect.width - 204, rect.y + 8, 48, 30), "＋", buttonStyle)) imageZoom = Mathf.Min(8, imageZoom * 1.5f);
            if (GUI.Button(new Rect(rect.x + rect.width - 148, rect.y + 8, 64, 30), "全体", buttonStyle)) { imageZoom = 1; imageScroll = Vector2.zero; }
            if (GUI.Button(new Rect(rect.x + rect.width - 76, rect.y + 8, 64, 30), "閉じる", buttonStyle)) { EndNoteEditing(); return; }
            if (!itemObjects.TryGetValue((string)item["id"], out var root)) return;
            var surface = root.GetComponentInChildren<ItemPanelSurface>();
            var texture = surface != null ? surface.Texture : null;
            var viewport = new Rect(rect.x + 12, rect.y + 48, rect.width - 24, rect.height - 60);
            if (texture == null)
            {
                GUI.Label(viewport, surface != null && surface.ImageLoadFailed ? "画像を読み込めませんでした" : "画像を読み込み中…", labelStyle);
                return;
            }
            float fit = Mathf.Min((viewport.width - 18) / texture.width, (viewport.height - 18) / texture.height);
            var size = new Vector2(texture.width, texture.height) * fit * imageZoom;
            var content = new Rect(0, 0, Mathf.Max(viewport.width - 18, size.x), Mathf.Max(viewport.height - 18, size.y));
            imageScroll = GUI.BeginScrollView(viewport, imageScroll, content);
            GUI.DrawTexture(new Rect((content.width - size.x) / 2, (content.height - size.y) / 2, size.x, size.y), texture, ScaleMode.ScaleToFit);
            GUI.EndScrollView();
        }

        void CommitNote()
        {
            // 自動保存待ちの最後の入力も、編集欄を閉じる前に同期する。
            if(selected==null||noteDraft==noteSent||!items.TryGetValue(selected,out var item)||(string)item["kind"]!="note")return;
            noteSent=noteDraft;
            item["text"] = noteDraft; ApplyItem(item);
            Room(new{t="itemAction",id=selected,action=new{a="noteEdit",text=noteDraft}});
        }

        void BeginNoteEditing(string id)
        {
            if (!items.TryGetValue(id, out var item) || (string)item["kind"] != "note") return;
            if (selected != id) EndNoteEditing();
            selected = id; noteDraft = (string)item["text"] ?? ""; noteSent = noteDraft; noteSentAt = Time.unscaledTime;
            Room(new { t = "itemAction", id, action = new { a = "noteLock", @lock = true } });
            Unlock();
        }

        void EndNoteEditing()
        {
            if (selected == null) return;
            string id = selected;
            if (items.TryGetValue(id, out var item) && (string)item["kind"] == "note")
            {
                CommitNote();
                Room(new { t = "itemAction", id, action = new { a = "noteLock", @lock = false } });
            }
            selected = null;
        }

        void HudPanel(Rect rect,string color)
        {
            if(!hudPanels.TryGetValue(color,out var style)){style=new GUIStyle{border=new RectOffset(7,7,7,7),normal={background=HudTexture(color)}};hudPanels[color]=style;}
            GUI.Box(rect,GUIContent.none,style);
        }

        Texture2D HudTexture(string color)
        {
            if(hudTextures.TryGetValue(color,out var existing))return existing;
            var texture=new Texture2D(32,32,TextureFormat.RGBA32,false);var fill=ColorValue(color);
            for(int y=0;y<32;y++)for(int x=0;x<32;x++){float dx=Mathf.Max(7-x,x-24),dy=Mathf.Max(7-y,y-24);texture.SetPixel(x,y,dx>0&&dy>0&&dx*dx+dy*dy>49?Color.clear:fill);}
            texture.Apply();hudTextures[color]=texture;return texture;
        }

        Texture2D HudReticle(bool active)
        {
            string key=active?"reticle-on":"reticle";if(hudTextures.TryGetValue(key,out var existing))return existing;
            var texture=new Texture2D(32,32,TextureFormat.RGBA32,false);
            for(int y=0;y<32;y++)for(int x=0;x<32;x++){float d=Vector2.Distance(new Vector2(x,y),new Vector2(15.5f,15.5f));texture.SetPixel(x,y,active?(d<15&&d>10?ColorValue("#fde047"):Color.clear):d<10?Color.white:d<14?new Color(0,0,0,.5f):Color.clear);}
            texture.Apply();hudTextures[key]=texture;return texture;
        }
    }
}
