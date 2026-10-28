# 折りたたみ端末の制作元

`folding-phone.blend` は左右の背面、中央ヒンジ、外周のベゼルを分け、編集可能なベベルを残した Blender 制作元。180度開いた状態を表示する。`build.py` は同じ制作元と表示用 `client/public/xr/folding-phone.glb` を再生成する。

Blender の単位はメートル、scale_length=1。表示用 glTF は +X が右、+Y が上、+Z が画面正面。画面位置は XY 平面 z=0、範囲は x,y とも -0.5〜0.5。外装は画面矩形の外側または裏側にあり、中央のヒンジも画面の裏に置く。PanelSurfaces はモデルの X/Y を HTMLMesh の実寸へ合わせ、画面と外装を同じグループで等比拡縮する。寸法変更時には外周のサイズを追従させる。

リポジトリルートから実行:

```powershell
blender --background --python assets/xr/folding-phone/build.py
```

手作業で編集した場合は画面原点を保持し、メートル・Y Up・GLB形式で同じ出力先へ書き出す。外装に画面を追加しない。実機での文字の可読性は別途確認する。
