package com.auleka.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PilotAttachmentsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
