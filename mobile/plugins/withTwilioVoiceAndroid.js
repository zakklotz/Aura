const { withMainActivity, withMainApplication, createRunOncePlugin } = require("@expo/config-plugins");

function addImport(source, statement) {
  if (source.includes(statement)) {
    return source;
  }

  const packageDeclarationMatch = source.match(/^package[^\n]*\n+/);
  if (!packageDeclarationMatch) {
    throw new Error("Unable to locate package declaration while patching Twilio Android imports.");
  }

  const insertIndex = packageDeclarationMatch[0].length;
  return `${source.slice(0, insertIndex)}${statement}\n${source.slice(insertIndex)}`;
}

function injectMainApplication(source) {
  let updated = source;

  updated = addImport(updated, "import com.twiliovoicereactnative.VoiceApplicationProxy");

  const classSignature = "class MainApplication : Application(), ReactApplication {";
  if (!updated.includes(classSignature)) {
    throw new Error("Unable to find MainApplication class signature for Twilio Android patch.");
  }

  const applicationProperty = "  private var voiceApplicationProxy: VoiceApplicationProxy? = null\n\n";
  if (!updated.includes("voiceApplicationProxy")) {
    updated = updated.replace(classSignature, `${classSignature}\n\n${applicationProperty}`);
  }

  const onCreateNeedle = "  override fun onCreate() {\n    super.onCreate()\n";
  if (!updated.includes("voiceApplicationProxy = VoiceApplicationProxy(this)")) {
    if (!updated.includes(onCreateNeedle)) {
      throw new Error("Unable to find MainApplication.onCreate for Twilio Android patch.");
    }
    updated = updated.replace(
      onCreateNeedle,
      `${onCreateNeedle}    voiceApplicationProxy = VoiceApplicationProxy(this)\n    voiceApplicationProxy?.onCreate()\n`,
    );
  }

  if (!updated.includes("override fun onTerminate()")) {
    const onConfigurationNeedle =
      "  override fun onConfigurationChanged(newConfig: Configuration) {\n    super.onConfigurationChanged(newConfig)\n    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)\n  }\n";
    if (!updated.includes(onConfigurationNeedle)) {
      throw new Error("Unable to find MainApplication.onConfigurationChanged for Twilio Android patch.");
    }
    updated = updated.replace(
      onConfigurationNeedle,
      `${onConfigurationNeedle}\n  override fun onTerminate() {\n    voiceApplicationProxy?.onTerminate()\n    super.onTerminate()\n  }\n`,
    );
  }

  return updated;
}

function injectMainActivity(source) {
  let updated = source;

  updated = addImport(updated, "import android.content.Intent");
  updated = addImport(updated, "import com.twiliovoicereactnative.VoiceActivityProxy");

  const classSignature = "class MainActivity : ReactActivity() {";
  if (!updated.includes(classSignature)) {
    throw new Error("Unable to find MainActivity class signature for Twilio Android patch.");
  }

  const activityProperty =
    "  private val voiceActivityProxy = VoiceActivityProxy(this) { /* Rationale is handled by system permission prompts in dev builds. */ }\n\n";
  if (!updated.includes("private val voiceActivityProxy = VoiceActivityProxy")) {
    updated = updated.replace(classSignature, `${classSignature}\n${activityProperty}`);
  }

  const onCreateNeedle = "  override fun onCreate(savedInstanceState: Bundle?) {\n";
  if (!updated.includes("voiceActivityProxy.onCreate(savedInstanceState)")) {
    if (!updated.includes(onCreateNeedle)) {
      throw new Error("Unable to find MainActivity.onCreate for Twilio Android patch.");
    }
    updated = updated.replace(
      "    super.onCreate(null)\n",
      "    super.onCreate(null)\n    voiceActivityProxy.onCreate(savedInstanceState)\n",
    );
  }

  if (!updated.includes("override fun onNewIntent(intent: Intent)")) {
    const createDelegateNeedle = "  override fun createReactActivityDelegate(): ReactActivityDelegate {\n";
    if (!updated.includes(createDelegateNeedle)) {
      throw new Error("Unable to find MainActivity.createReactActivityDelegate for Twilio Android patch.");
    }
    updated = updated.replace(
      createDelegateNeedle,
      "  override fun onNewIntent(intent: Intent) {\n    super.onNewIntent(intent)\n    setIntent(intent)\n    voiceActivityProxy.onNewIntent(intent)\n  }\n\n  override fun onDestroy() {\n    voiceActivityProxy.onDestroy()\n    super.onDestroy()\n  }\n\n  override fun createReactActivityDelegate(): ReactActivityDelegate {\n",
    );
  }

  return updated;
}

const withTwilioVoiceAndroid = (config) => {
  config = withMainApplication(config, (mod) => {
    mod.modResults.contents = injectMainApplication(mod.modResults.contents);
    return mod;
  });

  config = withMainActivity(config, (mod) => {
    mod.modResults.contents = injectMainActivity(mod.modResults.contents);
    return mod;
  });

  return config;
};

module.exports = createRunOncePlugin(withTwilioVoiceAndroid, "with-twilio-voice-android", "1.0.0");
