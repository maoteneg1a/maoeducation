package com.auleka.app;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "AulekaAttachments")
public class PilotAttachmentsPlugin extends Plugin {
    private static final int MAX_BYTES = 10 * 1024 * 1024;

    @PluginMethod
    public void open(PluginCall call) {
        String data = call.getString("data", "");
        String name = call.getString("name", "adjunto").replaceAll("[^\\p{L}\\p{N}._-]", "_");
        String mime = call.getString("mime", "application/octet-stream");
        if (data.isEmpty() || data.length() > ((MAX_BYTES + 2) / 3) * 4) {
            call.reject("Tamaño de archivo inválido");
            return;
        }
        try {
            File root = new File(getContext().getCacheDir(), "auleka-attachments");
            File[] old = root.listFiles();
            if (old != null) {
                long cutoff = System.currentTimeMillis() - 60 * 60 * 1000;
                for (File file : old) {
                    if (file.isFile() && file.lastModified() < cutoff) file.delete();
                }
            }
            if (!root.isDirectory() && !root.mkdirs()) throw new IllegalStateException("Caché no disponible");
            File file = new File(root, UUID.randomUUID() + "-" + name.substring(0, Math.min(name.length(), 80)));
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (bytes.length > MAX_BYTES) throw new IllegalArgumentException("Archivo demasiado grande");
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            boolean share = Boolean.TRUE.equals(call.getBoolean("share", false));
            Intent intent = new Intent(share ? Intent.ACTION_SEND : Intent.ACTION_VIEW);
            if (share) intent.setType(mime).putExtra(Intent.EXTRA_STREAM, uri);
            else intent.setDataAndType(uri, mime);
            intent.setClipData(ClipData.newRawUri(name, uri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(intent, share ? "Compartir archivo" : "Abrir archivo"));
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudo abrir el adjunto", error);
        }
    }
}
