# Persona Stand Images

ユニークAIの立ち絵は、次の形式で配置すると自動表示されます。

```text
assets/personas/{persona}/{mood}.png
```

小学生AIだけは、現在こちらの画像を使用しています。

```text
assets/pictures/unique_AI/junior/junior_default.png
assets/pictures/unique_AI/junior/junior_1.png
assets/pictures/unique_AI/junior/junior_2.png
assets/pictures/unique_AI/junior/junior_3.png
assets/pictures/unique_AI/junior/junior_4.png
assets/pictures/unique_AI/junior/junior_5.png
assets/pictures/unique_AI/junior/junior_6.png
assets/pictures/unique_AI/junior/junior_7.png
```

## Personas

- `kid`
- `cornerHunter`
- `cautious`
- `gambler`

## Moods

- `normal.png`: 通常
- `winning.png`: 勝ってる
- `losing.png`: 負けてる
- `win.png`: 勝利確定
- `lose.png`: 敗北確定
- `big-flip.png`: いっぱいひっくり返した
- `big-flipped.png`: いっぱいひっくり返された
- `comeback.png`: 逆転された

## 小学生AIの対応

- `junior_default.png`: 通常
- `junior_1.png`: 勝ってる
- `junior_2.png`: 負けてる
- `junior_3.png`: 勝利確定
- `junior_4.png`: 敗北確定
- `junior_5.png`: いっぱいひっくり返した
- `junior_6.png`: いっぱいひっくり返された
- `junior_7.png`: 逆転された

## 慎重派AIの対応

- `cautious_default.png`: 通常
- `cautious_1.png`: 勝ってる
- `cautious_2.png`: 負けてる
- `cautious_3.png`: 勝利確定
- `cautious_4.png`: 敗北確定
- `cautious_5.png`: いっぱいひっくり返した
- `cautious_6.png`: いっぱいひっくり返された
- `cautious_7.png`: 逆転された
- `cautious_Extra.png`: 隠し敗北表情

`cautious_Extra.png` は慎重派が敗北した時、次の条件で `cautious_4.png` の代わりに表示されます。

- プレイヤーがAIを全消しして勝った場合: 50%
- 終局時にAIの持ち石が5個以下だった場合: 10%
