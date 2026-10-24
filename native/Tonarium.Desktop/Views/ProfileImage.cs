using SkiaSharp;

namespace Tonarium.Desktop.Views;

internal static class ProfileImage
{
    internal static byte[] Encode(byte[] bytes, bool avatar)
    {
        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data) ?? throw new IOException("画像を読み込めません");
        using var original = SKBitmap.Decode(codec) ?? throw new IOException("画像を読み込めません");
        var origin = codec.EncodedOrigin;
        bool swapped = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        using var oriented = new SKBitmap(swapped ? original.Height : original.Width, swapped ? original.Width : original.Height);
        using (var canvas = new SKCanvas(oriented))
        {
            switch (origin)
            {
                case SKEncodedOrigin.TopRight: canvas.Translate(original.Width, 0); canvas.Scale(-1, 1); break;
                case SKEncodedOrigin.BottomRight: canvas.Translate(original.Width, original.Height); canvas.RotateDegrees(180); break;
                case SKEncodedOrigin.BottomLeft: canvas.Translate(0, original.Height); canvas.Scale(1, -1); break;
                case SKEncodedOrigin.LeftTop: canvas.RotateDegrees(90); canvas.Scale(1, -1); break;
                case SKEncodedOrigin.RightTop: canvas.Translate(original.Height, 0); canvas.RotateDegrees(90); break;
                case SKEncodedOrigin.RightBottom: canvas.Translate(original.Height, original.Width); canvas.RotateDegrees(90); canvas.Scale(-1, 1); break;
                case SKEncodedOrigin.LeftBottom: canvas.Translate(0, original.Width); canvas.RotateDegrees(-90); break;
            }
            canvas.DrawBitmap(original, 0, 0);
        }
        using var output = new SKBitmap(avatar ? 2048 : 128, avatar ? 1024 : 128);
        using (var canvas = new SKCanvas(output))
        {
            canvas.Clear(avatar ? SKColors.Transparent : SKColors.White);
            var size = Math.Min(oriented.Width, oriented.Height);
            var source = avatar ? new SKRect(0, 0, oriented.Width, oriented.Height) : SKRect.Create((oriented.Width - size) / 2f, (oriented.Height - size) / 2f, size, size);
            using var orientedImage = SKImage.FromBitmap(oriented);
            canvas.DrawImage(orientedImage, source, new SKRect(0, 0, output.Width, output.Height), new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        }
        using var image = SKImage.FromBitmap(output);
        using var encoded = image.Encode(avatar ? SKEncodedImageFormat.Png : SKEncodedImageFormat.Jpeg, 85);
        return encoded.ToArray();
    }
}
