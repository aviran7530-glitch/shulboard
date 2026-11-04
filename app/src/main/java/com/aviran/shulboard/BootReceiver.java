package com.aviran.shulboard;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/** מפעיל את האפליקציה אוטומטית אחרי הדלקת המכשיר (אם הוגדר בהגדרות). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(a)
                && !"com.htc.intent.action.QUICKBOOT_POWERON".equals(a)) return;

        SharedPreferences sp = context.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
        if (!sp.getBoolean(MainActivity.KEY_AUTOSTART, false)) return;

        try {
            Intent i = new Intent(context, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            i.putExtra(MainActivity.EXTRA_FROM_BOOT, true);
            context.startActivity(i);
        } catch (Exception ignored) {
            // אם המערכת חוסמת (חסרה הרשאת "הצגה מעל אפליקציות") - אין מה לעשות
        }
    }
}
