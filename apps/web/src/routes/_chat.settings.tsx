import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { OPENROUTER_FREE_ROUTER_MODEL, type ProviderKind } from "@t3tools/contracts";
import { getModelOptions, isCodexOpenRouterModel, normalizeModelSlug } from "@t3tools/shared/model";
import { ImagePlusIcon, LoaderCircleIcon, RefreshCwIcon, Trash2Icon, ZapIcon } from "lucide-react";

import {
  APP_SERVICE_TIER_OPTIONS,
  DEFAULT_CHAT_BACKGROUND_IMAGE_BLUR_PX,
  DEFAULT_CHAT_BACKGROUND_IMAGE_FADE_PERCENT,
  MAX_CHAT_BACKGROUND_IMAGE_BLUR_PX,
  MAX_CHAT_BACKGROUND_IMAGE_BYTES,
  MAX_CHAT_BACKGROUND_IMAGE_DATA_URL_LENGTH,
  MAX_CUSTOM_MODEL_LENGTH,
  useAppSettings,
} from "../appSettings";
import { getAppLanguageDetails, type AppLanguage } from "../appLanguage";
import { resolveAndPersistPreferredEditor } from "../editorPreferences";
import { isElectron } from "../env";
import { useChatBackgroundImage } from "../hooks/useChatBackgroundImage";
import { removeChatBackgroundBlob, saveChatBackgroundBlob } from "../lib/chatBackgroundStorage";
import { formatCompactTokenCount } from "../lib/contextWindow";
import {
  isCut3CompatibleOpenRouterModelOption,
  isOpenRouterGuaranteedFreeSlug,
  OPENROUTER_FREE_ROUTER_OPTION,
  supportsOpenRouterNativeToolCalling,
} from "../lib/openRouterModels";
import { openRouterFreeModelsQueryOptions } from "../lib/openRouterReactQuery";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { ensureNativeApi } from "../nativeApi";
import { AppearanceSettingsSection } from "../components/AppearanceSettingsSection";
import { OpenCodeCredentialsManager } from "../components/OpenCodeCredentialsManager";
import { PermissionPoliciesSection } from "../components/settings/PermissionPoliciesSection";
import ThreadNewButton from "../components/ThreadNewButton";
import ThreadSidebarToggle from "../components/ThreadSidebarToggle";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { APP_VERSION } from "../branding";
import { useStore } from "../store";
import { getLatestServerWelcome } from "../wsNativeApi";
import { SidebarInset } from "~/components/ui/sidebar";

const MODEL_PROVIDER_SETTINGS: Array<{
  provider: Extract<ProviderKind, "copilot" | "opencode" | "kimi">;
  title: string;
  description: string;
  placeholder: string;
  example: string;
}> = [
  {
    provider: "copilot",
    title: "GitHub Copilot",
    description: "Save additional Copilot model slugs for the picker and `/model` command.",
    placeholder: "your-copilot-model-slug",
    example: "claude-sonnet-4.6",
  },
  {
    provider: "opencode",
    title: "OpenCode",
    description: "Save extra provider/model IDs for the picker and `/model`.",
    placeholder: "provider/model-id",
    example: "z-ai/glm-4.5",
  },
  {
    provider: "kimi",
    title: "Kimi Code",
    description: "Save additional Kimi Code model ids for the picker and `/model` command.",
    placeholder: "your-kimi-model-id",
    example: "kimi-for-coding",
  },
] as const;

function getSettingsCopy(language: AppLanguage) {
  if (language === "fa") {
    return {
      settingsLabel: "تنظیمات",
      settingsDescription: "ترجیحات برنامه برای این دستگاه را تنظیم کنید.",
      chatBackgroundTitle: "پس زمینه گفتگو",
      chatBackgroundDescription: "یک تصویر سفارشی پشت خط زمانی گفتگو در این دستگاه قرار دهید.",
      status: "وضعیت",
      customImageActive: "تصویر سفارشی فعال است",
      defaultBackground: "پس زمینه پیش فرض",
      file: "فایل",
      none: "هیچ کدام",
      fade: "محو شدگی",
      blur: "تار شدگی",
      changeBackground: "تغییر پس زمینه",
      addBackground: "افزودن پس زمینه",
      removeBackground: "حذف پس زمینه",
      fadeDescription:
        "مقادیر کمتر تصویر را بیشتر نشان می دهند. مقادیر بیشتر آن را در سطح گفتگو محو می کنند.",
      blurDescription: "برای نرم تر شدن والپیپرهای پرجزئیات پشت پیام ها، تاری را بیشتر کنید.",
      resetImageEffects: "بازنشانی افکت های تصویر",
      imageStorageNote: (sizeLabel: string) =>
        `CUT3 این تصویر را در تنظیمات محلی همین دستگاه نگه می دارد. اندازه آن را حداکثر ${sizeLabel} نگه دارید.`,
      chooseImageFile: "یک فایل تصویری انتخاب کنید.",
      imageTooLarge: (sizeLabel: string) =>
        `یک تصویر حداکثر ${sizeLabel} انتخاب کنید تا به صورت محلی ذخیره شود.`,
      backgroundImageFallbackName: "تصویر پس زمینه",
      browserPersistError: "این مرورگر نتوانست تصویر پس زمینه گفتگو را به صورت محلی نگه دارد.",
      imageLoadFailed: "بارگذاری تصویر انتخاب شده انجام نشد.",
      codexTitle: "Codex App Server",
      codexDescription:
        "این بازنویسی ها روی نشست های جدید اعمال می شوند و به شما اجازه می دهند از نصب غیرپیش فرض Codex استفاده کنید.",
      codexBinaryPath: "مسیر باینری Codex",
      leaveBlankCodex: "برای استفاده از codex از PATH این کادر را خالی بگذارید.",
      codexHomePath: "مسیر CODEX_HOME",
      codexHomeDescription: "شاخه خانگی/پیکربندی سفارشی Codex (اختیاری).",
      binarySource: "منبع باینری",
      resetCodexOverrides: "بازنشانی بازنویسی های Codex",
      openRouterTitle: "OpenRouter",
      openRouterDescription:
        "CUT3، OpenRouter را به صورت یک بخش مستقل در رابط نشان می دهد و این نشست ها را از پشت صحنه از طریق Codex اجرا می کند؛ بنابراین می توانید از openrouter/free یا مدل های ذخیره شده :free بدون تغییر پیکربندی عادی Codex استفاده کنید.",
      openRouterApiKey: "کلید API OpenRouter",
      openRouterKeyDescription: (electron: boolean) =>
        electron
          ? "فقط برای مدل های Codex که از OpenRouter عبور می کنند لازم است. CUT3 آن را در نشست دسکتاپ نگه می دارد و در صورت وجود ذخیره سازی امن، در مخزن اعتبار سیستم عامل ذخیره می کند. برای مجموعه مدل های رایگان فعلی از openrouter/free استفاده کنید یا در ادامه اسلاگ های :free مشخص را اضافه کنید."
          : "فقط برای مدل های Codex که از OpenRouter عبور می کنند لازم است. CUT3 آن را فقط در حافظه نشست فعلی مرورگر نگه می دارد. برای مجموعه مدل های رایگان فعلی از openrouter/free استفاده کنید یا در ادامه اسلاگ های :free مشخص را اضافه کنید.",
      openRouterConfigured: "کلید OpenRouter برای نشست های جدید Codex تنظیم شده است.",
      openRouterMissing: "برای استفاده از مدل های Codex مبتنی بر OpenRouter یک کلید اضافه کنید.",
      resetOpenRouterKey: "بازنشانی کلید OpenRouter",
      copilotTitle: "GitHub Copilot CLI",
      copilotDescription:
        "این بازنویسی روی نشست های جدید Copilot اعمال می شود و به شما اجازه می دهد از نصب غیرپیش فرض copilot استفاده کنید.",
      copilotBinaryPath: "مسیر باینری Copilot",
      leaveBlankCopilot: "برای استفاده از copilot از PATH این کادر را خالی بگذارید.",
      resetCopilotOverrides: "بازنشانی بازنویسی های Copilot",
      opencodeTitle: "OpenCode",
      opencodeDescription:
        "برای نشست های جدید OpenCode اعمال می شود و به CUT3 اجازه می دهد از نصب غیرپیش فرض opencode استفاده کند. اعتبارنامه ها را با opencode auth login و opencode auth logout مدیریت کنید، و اگر پیکربندی OpenCode شما به OPENROUTER_API_KEY نیاز دارد کلید OpenRouter را در بخش بالایی CUT3 وارد کنید.",
      opencodeBinaryPath: "مسیر باینری",
      leaveBlankOpencode: "برای استفاده از opencode از PATH این کادر را خالی بگذارید.",
      resetOpencodeOverrides: "بازنشانی بازنویسی ها",
      kimiTitle: "Kimi Code CLI",
      kimiDescription:
        "این بازنویسی ها روی نشست های جدید Kimi Code اعمال می شوند. با دستور curl -LsSf https://code.kimi.com/install.sh | bash نصب کنید، سپس با kimi login یا دستور /login در خود CLI وارد شوید؛ یا برای شروع مستقیم نشست ها از همین جا یک کلید API Kimi Code اضافه کنید.",
      kimiBinaryPath: "مسیر باینری Kimi",
      leaveBlankKimi: "برای استفاده از kimi از PATH این کادر را خالی بگذارید.",
      kimiApiKey: "کلید API Kimi",
      kimiApiDescription: (electron: boolean) =>
        electron
          ? "اگر می خواهید CUT3 نشست های Kimi را مستقیم شروع کند، این کلید را از Kimi Code Console بسازید. CUT3 آن را در نشست دسکتاپ نگه می دارد و در صورت وجود ذخیره سازی امن، در مخزن اعتبار سیستم عامل ذخیره می کند. اگر ترجیح می دهید از ورود محلی CLI استفاده کنید، این فیلد را خالی بگذارید و با kimi login یا /login وارد شوید."
          : "اگر می خواهید CUT3 نشست های Kimi را مستقیم شروع کند، این کلید را از Kimi Code Console بسازید. CUT3 آن را فقط در حافظه نشست فعلی مرورگر نگه می دارد. اگر ترجیح می دهید از ورود محلی CLI استفاده کنید، این فیلد را خالی بگذارید و با kimi login یا /login وارد شوید.",
      resetKimiOverrides: "بازنشانی بازنویسی های Kimi",
      modelsTitle: "مدل ها",
      modelsDescription:
        "اسلاگ های مدل اضافی را ذخیره کنید تا در انتخابگر مدل گفتگو و پیشنهادهای دستور /model دیده شوند. مدل های رایگان OpenRouter اکنون بخش مستقل خودشان را دارند.",
      defaultServiceTier: "رده سرویس پیش فرض",
      serviceTierOptions: {
        auto: {
          label: "خودکار",
          description: "از پیش فرض های Codex بدون اجبار رده سرویس استفاده می کند.",
        },
        fast: {
          label: "سریع",
          description: "در صورت پشتیبانی مدل، رده سرویس سریع را درخواست می کند.",
        },
        flex: {
          label: "فلکس",
          description: "در صورت پشتیبانی مدل، رده سرویس فلکس را درخواست می کند.",
        },
      },
      openRouterFreeModelsTitle: "مدل های رایگان OpenRouter",
      openRouterFreeModelsDescription: (routerSlug: string) =>
        `CUT3 کاتالوگ زنده OpenRouter را بررسی می کند و مدل هایی را نشان می دهد که همین حالا رایگان هستند. روتر داخلی ${routerSlug} همیشه در دسترس است و می توانید هر مدل رایگان زنده را ذخیره کنید تا در انتخابگر و پیشنهادهای /model ظاهر شود.`,
      refreshList: "نوسازی فهرست",
      openRouterChecking: "در حال بررسی OpenRouter برای فهرست فعلی مدل های رایگان...",
      openRouterAvailable: (count: number) =>
        `${count} مدل رایگان زنده OpenRouter در حال حاضر با مسیر بومی ابزار CUT3 سازگار ${count === 1 ? "است" : "هستند"}، به علاوه روتر داخلی.`,
      openRouterUnavailable: "کشف زنده مدل های رایگان OpenRouter در حال حاضر در دسترس نیست.",
      openRouterFilteringNote: (routerSlug: string) =>
        `CUT3 فقط انتخاب هایی را نشان می دهد که روی :free یا ${routerSlug} قفل شده باشند و از ابزارها پشتیبانی کنند.`,
      lastCheckedAt: (label: string) => `آخرین بررسی در ${label}.`,
      builtIn: "داخلی",
      saved: "ذخیره شده",
      addToPicker: "افزودن به انتخابگر",
      additionalCodexModelSlug: "اسلاگ مدل اضافی Codex یا OpenRouter",
      additionalCodexModelHelp:
        "یک شناسه مدل سفارشی Codex ذخیره کنید، یا اگر می خواهید آن را دستی سنجاق کنید یک اسلاگ :free فعلی OpenRouter را که tools و tool_choice را اعلام می کند وارد کنید.",
      addModel: "افزودن مدل",
      savedCodexOpenRouterCount: (count: number) =>
        `شناسه های ذخیره شده Codex/OpenRouter: ${count}`,
      resetSavedCodexOpenRouter: "بازنشانی مدل های ذخیره شده Codex/OpenRouter",
      noSavedCodexOpenRouter: "هنوز هیچ شناسه Codex/OpenRouter ذخیره نشده است.",
      customModelSlug: "اسلاگ مدل سفارشی",
      example: "نمونه",
      savedCustomModels: (count: number) => `مدل های سفارشی ذخیره شده: ${count}`,
      resetCustomModels: "بازنشانی مدل های سفارشی",
      noCustomModels: "هنوز هیچ مدل سفارشی ذخیره نشده است.",
      remove: "حذف",
      providerCards: {
        copilot: {
          title: "GitHub Copilot",
          description: "اسلاگ های مدل اضافی Copilot را برای انتخابگر و دستور /model ذخیره کنید.",
        },
        opencode: {
          title: "OpenCode",
          description: "شناسه های provider/model اضافی را برای انتخابگر و دستور /model ذخیره کنید.",
        },
        kimi: {
          title: "Kimi Code",
          description: "شناسه های مدل اضافی Kimi Code را برای انتخابگر و دستور /model ذخیره کنید.",
        },
      },
      threadsTitle: "رشته ها",
      threadsDescription: "حالت فضای کاری پیش فرض برای رشته های پیش نویس جدید را انتخاب کنید.",
      defaultToNewWorktree: "پیش فرض روی New worktree",
      defaultToNewWorktreeDescription:
        "رشته های جدید به جای Local در حالت New worktree شروع می شوند.",
      restoreDefault: "بازگردانی پیش فرض",
      responsesTitle: "پاسخ ها",
      responsesDescription: "مشخص کنید خروجی دستیار هنگام اجرا چگونه نمایش داده شود.",
      streamAssistantMessages: "پخش زنده پیام های دستیار",
      streamAssistantMessagesDescription:
        "وقتی پاسخ در حال تولید است، خروجی را به صورت توکن به توکن نشان می دهد.",
      keybindingsTitle: "کلیدهای میانبر",
      keybindingsDescription:
        "برای ویرایش مستقیم میانبرهای پیشرفته، فایل keybindings.json ذخیره شده را باز کنید.",
      configFilePath: "مسیر فایل پیکربندی",
      resolvingKeybindingsPath: "در حال پیدا کردن مسیر keybindings...",
      opening: "در حال باز کردن...",
      openKeybindings: "باز کردن keybindings.json",
      opensInPreferredEditor: "در ویرایشگر ترجیحی شما باز می شود.",
      safetyTitle: "ایمنی",
      safetyDescription: "محافظت های اضافی برای اقدامات مخرب محلی.",
      confirmThreadDeletion: "تایید حذف رشته",
      confirmThreadDeletionDescription: "پیش از حذف رشته و تاریخچه گفتگوی آن تایید بگیرید.",
      aboutTitle: "درباره",
      aboutDescription: "اطلاعات نسخه و محیط برنامه.",
      version: "نسخه",
      versionDescription: "نسخه فعلی برنامه.",
      enterModelSlug: "یک اسلاگ مدل وارد کنید.",
      modelAlreadyBuiltIn: "این مدل از قبل داخلی است.",
      modelTooLong: (maxLength: number) => `اسلاگ مدل باید حداکثر ${maxLength} کاراکتر باشد.`,
      customModelAlreadySaved: "این مدل سفارشی قبلا ذخیره شده است.",
      openRouterMustBeFree:
        "شناسه های مدل OpenRouter باید از openrouter/free یا یک اسلاگ صریح :free استفاده کنند تا CUT3 ناخواسته به مدل پولی منتقل نشود.",
      openRouterNotInCatalog:
        "این مدل OpenRouter در کاتالوگ زنده فعلی رایگان وجود ندارد. فهرست را نوسازی کنید و یک مدل :free فعلی انتخاب کنید.",
      openRouterNeedsTools:
        "CUT3 به مدل های OpenRouter نیاز دارد که هم tools و هم tool_choice را اعلام کنند. یک مدل رایگان دیگر انتخاب کنید یا از openrouter/free استفاده کنید.",
      noEditorsFound: "هیچ ویرایشگری در دسترس نیست.",
      openKeybindingsFailed: "باز کردن فایل کلیدهای میانبر ممکن نشد.",
      openRouterWarningMissingCatalog: "دیگر در کاتالوگ زنده رایگان فعلی OpenRouter دیده نمی شود.",
      openRouterWarningMissingToolCalling:
        "پشتیبانی بومی ابزار OpenRouter (`tools` + `tool_choice`) وجود ندارد.",
    };
  }

  return {
    settingsLabel: "Settings",
    settingsDescription: "Configure app-level preferences for this device.",
    chatBackgroundTitle: "Chat background",
    chatBackgroundDescription: "Add a custom image behind the chat timeline on this device.",
    status: "Status",
    customImageActive: "Custom image active",
    defaultBackground: "Default background",
    file: "File",
    none: "None",
    fade: "Fade",
    blur: "Blur",
    changeBackground: "Change background",
    addBackground: "Add background",
    removeBackground: "Remove background",
    fadeDescription:
      "Lower values reveal more of the image. Higher values fade it into the chat surface.",
    blurDescription: "Increase blur to soften detailed wallpapers behind message content.",
    resetImageEffects: "Reset image effects",
    imageStorageNote: (sizeLabel: string) =>
      `CUT3 stores this image in local app settings on this device. Keep it at or under ${sizeLabel}.`,
    chooseImageFile: "Choose an image file.",
    imageTooLarge: (sizeLabel: string) =>
      `Choose an image up to ${sizeLabel} so it can be saved locally.`,
    backgroundImageFallbackName: "background image",
    browserPersistError: "This browser could not persist the chat background image locally.",
    imageLoadFailed: "Failed to load the selected image.",
    codexTitle: "Codex App Server",
    codexDescription:
      "These overrides apply to new sessions and let you use a non-default Codex install.",
    codexBinaryPath: "Codex binary path",
    leaveBlankCodex: "Leave blank to use codex from your PATH.",
    codexHomePath: "CODEX_HOME path",
    codexHomeDescription: "Optional custom Codex home/config directory.",
    binarySource: "Binary source",
    resetCodexOverrides: "Reset codex overrides",
    openRouterTitle: "OpenRouter",
    openRouterDescription:
      "CUT3 exposes OpenRouter as its own top-level UI section and routes those sessions through Codex under the hood, so you can use the built-in openrouter/free router or saved OpenRouter :free model ids without editing your normal Codex config.",
    openRouterApiKey: "OpenRouter API key",
    openRouterKeyDescription: (electron: boolean) =>
      electron
        ? "Needed only for Codex models routed through OpenRouter. CUT3 keeps it in the desktop session and persists it in your OS credential store when secure storage is available. Use openrouter/free for the current free-model pool, or add specific :free slugs below."
        : "Needed only for Codex models routed through OpenRouter. CUT3 keeps it only in memory for the current browser session. Use openrouter/free for the current free-model pool, or add specific :free slugs below.",
    openRouterConfigured: "OpenRouter key is configured for new Codex sessions.",
    openRouterMissing: "Add a key to use OpenRouter-routed Codex models.",
    resetOpenRouterKey: "Reset OpenRouter key",
    copilotTitle: "GitHub Copilot CLI",
    copilotDescription:
      "This override applies to new Copilot sessions and lets you use a non-default copilot install.",
    copilotBinaryPath: "Copilot binary path",
    leaveBlankCopilot: "Leave blank to use copilot from your PATH.",
    resetCopilotOverrides: "Reset copilot overrides",
    opencodeTitle: "OpenCode",
    opencodeDescription:
      "Applies to new OpenCode sessions and lets CUT3 use a non-default `opencode` install. Manage credentials with `opencode auth login` and `opencode auth logout`, and add the top-level OpenRouter key in CUT3 if your OpenCode config expects `OPENROUTER_API_KEY`.",
    opencodeBinaryPath: "Binary path",
    leaveBlankOpencode: "Leave blank to use opencode from your PATH.",
    resetOpencodeOverrides: "Reset overrides",
    kimiTitle: "Kimi Code CLI",
    kimiDescription:
      "These overrides apply to new Kimi Code sessions. Install with curl -LsSf https://code.kimi.com/install.sh | bash, then authenticate with `kimi login` or the in-shell `/login` flow, or add a Kimi Code API key here to let CUT3 start sessions directly.",
    kimiBinaryPath: "Kimi binary path",
    leaveBlankKimi: "Leave blank to use kimi from your PATH.",
    kimiApiKey: "Kimi API key",
    kimiApiDescription: (electron: boolean) =>
      electron
        ? "Generate this from the Kimi Code Console if you want CUT3 to start Kimi sessions directly. CUT3 keeps it in the desktop session and persists it in your OS credential store when secure storage is available. Leave this blank if you prefer to authenticate in the local CLI with `kimi login` or `/login`."
        : "Generate this from the Kimi Code Console if you want CUT3 to start Kimi sessions directly. CUT3 keeps it only in memory for the current browser session. Leave this blank if you prefer to authenticate in the local CLI with `kimi login` or `/login`.",
    resetKimiOverrides: "Reset kimi overrides",
    modelsTitle: "Models",
    modelsDescription:
      "Save additional provider model slugs so they appear in the chat model picker and /model command suggestions. OpenRouter free models now have their own section, while the cards below handle additional provider-specific custom models.",
    defaultServiceTier: "Default service tier",
    serviceTierOptions: {
      auto: {
        label: "Automatic",
        description: "Use Codex defaults without forcing a service tier.",
      },
      fast: {
        label: "Fast",
        description: "Request the fast service tier when the model supports it.",
      },
      flex: {
        label: "Flex",
        description: "Request the flex service tier when the model supports it.",
      },
    },
    openRouterFreeModelsTitle: "OpenRouter Free Models",
    openRouterFreeModelsDescription: (routerSlug: string) =>
      `CUT3 checks OpenRouter's live catalog and lists the models that are free right now. The built-in ${routerSlug} router is always available, and you can save any live free model below so it shows up in the picker and /model suggestions.`,
    refreshList: "Refresh list",
    openRouterChecking: "Checking OpenRouter for the current free-model list...",
    openRouterAvailable: (count: number) =>
      `${count} live OpenRouter free model${count === 1 ? " is" : "s are"} currently compatible with CUT3's native tool-calling path, plus the built-in router.`,
    openRouterUnavailable: "Live OpenRouter free-model discovery is currently unavailable.",
    openRouterFilteringNote: (routerSlug: string) =>
      `CUT3 only lists OpenRouter picks that are locked to :free or ${routerSlug} and advertise tool use.`,
    lastCheckedAt: (label: string) => `Last checked at ${label}.`,
    builtIn: "Built in",
    saved: "Saved",
    addToPicker: "Add to picker",
    additionalCodexModelSlug: "Additional Codex or OpenRouter model slug",
    additionalCodexModelHelp:
      "Save a custom Codex model id, or paste a currently listed OpenRouter :free slug that advertises tools and tool_choice if you want to pin it manually.",
    addModel: "Add model",
    savedCodexOpenRouterCount: (count: number) => `Saved Codex/OpenRouter model ids: ${count}`,
    resetSavedCodexOpenRouter: "Reset saved Codex/OpenRouter models",
    noSavedCodexOpenRouter: "No saved Codex/OpenRouter model ids yet.",
    customModelSlug: "Custom model slug",
    example: "Example",
    savedCustomModels: (count: number) => `Saved custom models: ${count}`,
    resetCustomModels: "Reset custom models",
    noCustomModels: "No custom models saved yet.",
    remove: "Remove",
    providerCards: {
      copilot: {
        title: "GitHub Copilot",
        description: "Save additional Copilot model slugs for the picker and /model command.",
      },
      opencode: {
        title: "OpenCode",
        description: "Save extra provider/model IDs for the picker and /model.",
      },
      kimi: {
        title: "Kimi Code",
        description: "Save additional Kimi Code model ids for the picker and /model command.",
      },
    },
    threadsTitle: "Threads",
    threadsDescription: "Choose the default workspace mode for newly created draft threads.",
    defaultToNewWorktree: "Default to New worktree",
    defaultToNewWorktreeDescription: "New threads start in New worktree mode instead of Local.",
    restoreDefault: "Restore default",
    responsesTitle: "Responses",
    responsesDescription: "Control how assistant output is rendered during a turn.",
    streamAssistantMessages: "Stream assistant messages",
    streamAssistantMessagesDescription:
      "Show token-by-token output while a response is in progress.",
    keybindingsTitle: "Keybindings",
    keybindingsDescription:
      "Open the persisted keybindings.json file to edit advanced bindings directly.",
    configFilePath: "Config file path",
    resolvingKeybindingsPath: "Resolving keybindings path...",
    opening: "Opening...",
    openKeybindings: "Open keybindings.json",
    opensInPreferredEditor: "Opens in your preferred editor selection.",
    safetyTitle: "Safety",
    safetyDescription: "Additional guardrails for destructive local actions.",
    confirmThreadDeletion: "Confirm thread deletion",
    confirmThreadDeletionDescription:
      "Ask for confirmation before deleting a thread and its chat history.",
    aboutTitle: "About",
    aboutDescription: "Application version and environment information.",
    version: "Version",
    versionDescription: "Current version of the application.",
    enterModelSlug: "Enter a model slug.",
    modelAlreadyBuiltIn: "That model is already built in.",
    modelTooLong: (maxLength: number) => `Model slugs must be ${maxLength} characters or less.`,
    customModelAlreadySaved: "That custom model is already saved.",
    openRouterMustBeFree:
      "OpenRouter model ids must use openrouter/free or an explicit :free slug so CUT3 cannot drift onto a billed model.",
    openRouterNotInCatalog:
      "That OpenRouter model is not in the current live free catalog. Refresh the list and pick a currently free :free model.",
    openRouterNeedsTools:
      "CUT3 requires OpenRouter models that advertise both tools and tool_choice. Pick another listed free model or use openrouter/free.",
    noEditorsFound: "No available editors found.",
    openKeybindingsFailed: "Unable to open keybindings file.",
    openRouterWarningMissingCatalog: "No longer appears in OpenRouter's current live free catalog.",
    openRouterWarningMissingToolCalling:
      "Missing OpenRouter native tool-calling support (`tools` + `tool_choice`).",
  };
}

const CHAT_BACKGROUND_IMAGE_SIZE_LIMIT_LABEL = `${Math.round(
  MAX_CHAT_BACKGROUND_IMAGE_BYTES / (1024 * 1024),
)}MB`;

function clampChatBackgroundFadePercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampChatBackgroundBlurPx(value: number): number {
  return Math.min(MAX_CHAT_BACKGROUND_IMAGE_BLUR_PX, Math.max(0, Math.round(value)));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image data."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read image."));
    });
    reader.readAsDataURL(file);
  });
}

function getCustomModelsForProvider(
  settings: ReturnType<typeof useAppSettings>["settings"],
  provider: ProviderKind,
) {
  switch (provider) {
    case "codex":
      return settings.customCodexModels;
    case "copilot":
      return settings.customCopilotModels;
    case "opencode":
      return settings.customOpencodeModels;
    case "kimi":
      return settings.customKimiModels;
    default:
      return settings.customCodexModels;
  }
}

function getDefaultCustomModelsForProvider(
  defaults: ReturnType<typeof useAppSettings>["defaults"],
  provider: ProviderKind,
) {
  switch (provider) {
    case "codex":
      return defaults.customCodexModels;
    case "copilot":
      return defaults.customCopilotModels;
    case "opencode":
      return defaults.customOpencodeModels;
    case "kimi":
      return defaults.customKimiModels;
    default:
      return defaults.customCodexModels;
  }
}

function patchCustomModels(provider: ProviderKind, models: string[]) {
  switch (provider) {
    case "codex":
      return { customCodexModels: models };
    case "copilot":
      return { customCopilotModels: models };
    case "opencode":
      return { customOpencodeModels: models };
    case "kimi":
      return { customKimiModels: models };
    default:
      return { customCodexModels: models };
  }
}

function renderCapabilityBadge(label: string) {
  return (
    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function SettingsRouteView() {
  const { settings, defaults, updateSettings } = useAppSettings();
  const projects = useStore((store) => store.projects);
  const copy = useMemo(() => getSettingsCopy(settings.language), [settings.language]);
  const languageLocale = getAppLanguageDetails(settings.language).locale;
  const settingsDirection = getAppLanguageDetails(settings.language).dir;
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const openRouterCatalogQuery = useQuery(openRouterFreeModelsQueryOptions());
  const [isOpeningKeybindings, setIsOpeningKeybindings] = useState(false);
  const [openKeybindingsError, setOpenKeybindingsError] = useState<string | null>(null);
  const [chatBackgroundError, setChatBackgroundError] = useState<string | null>(null);
  const [isUpdatingChatBackground, setIsUpdatingChatBackground] = useState(false);
  const [customModelInputByProvider, setCustomModelInputByProvider] = useState<
    Record<ProviderKind, string>
  >({
    codex: "",
    copilot: "",
    opencode: "",
    kimi: "",
  });
  const [customModelErrorByProvider, setCustomModelErrorByProvider] = useState<
    Partial<Record<ProviderKind, string | null>>
  >({});
  const chatBackgroundFileInputRef = useRef<HTMLInputElement | null>(null);

  const codexBinaryPath = settings.codexBinaryPath;
  const codexHomePath = settings.codexHomePath;
  const openRouterApiKey = settings.openRouterApiKey;
  const copilotBinaryPath = settings.copilotBinaryPath;
  const opencodeBinaryPath = settings.opencodeBinaryPath;
  const kimiBinaryPath = settings.kimiBinaryPath;
  const kimiApiKey = settings.kimiApiKey;
  const codexServiceTier = settings.codexServiceTier;
  const openRouterFreeModels = useMemo(
    () => openRouterCatalogQuery.data?.models ?? [OPENROUTER_FREE_ROUTER_OPTION],
    [openRouterCatalogQuery.data?.models],
  );
  const hasLiveOpenRouterCatalog = openRouterCatalogQuery.data?.status === "available";
  const compatibleOpenRouterFreeModels = useMemo(
    () => openRouterFreeModels.filter(isCut3CompatibleOpenRouterModelOption),
    [openRouterFreeModels],
  );
  const openRouterModelsBySlug = useMemo(
    () => new Map(openRouterFreeModels.map((model) => [model.slug, model])),
    [openRouterFreeModels],
  );
  const openRouterCatalogModelCount = compatibleOpenRouterFreeModels.filter(
    (model) => model.source === "catalog",
  ).length;
  const latestWelcome = getLatestServerWelcome();
  const activeProjectId = useMemo(() => {
    const fromCwd = latestWelcome?.cwd
      ? (projects.find((project) => project.cwd === latestWelcome.cwd)?.id ?? null)
      : null;
    return fromCwd ?? latestWelcome?.bootstrapProjectId ?? null;
  }, [latestWelcome?.bootstrapProjectId, latestWelcome?.cwd, projects]);
  const openRouterCustomModelInput = customModelInputByProvider.codex;
  const openRouterCustomModelError = customModelErrorByProvider.codex ?? null;
  const savedOpenRouterModels = settings.customCodexModels;
  const savedOpenRouterModelWarnings = useMemo(
    () =>
      new Map(
        savedOpenRouterModels.map((slug) => {
          if (
            !hasLiveOpenRouterCatalog ||
            !isCodexOpenRouterModel(slug) ||
            !isOpenRouterGuaranteedFreeSlug(slug) ||
            slug === OPENROUTER_FREE_ROUTER_MODEL
          ) {
            return [slug, null] as const;
          }

          const catalogEntry = openRouterModelsBySlug.get(slug) ?? null;
          if (catalogEntry === null) {
            return [slug, copy.openRouterWarningMissingCatalog] as const;
          }
          if (!supportsOpenRouterNativeToolCalling(catalogEntry)) {
            return [slug, copy.openRouterWarningMissingToolCalling] as const;
          }
          return [slug, null] as const;
        }),
      ),
    [copy, hasLiveOpenRouterCatalog, openRouterModelsBySlug, savedOpenRouterModels],
  );
  const keybindingsConfigPath = serverConfigQuery.data?.keybindingsConfigPath ?? null;
  const availableEditors = serverConfigQuery.data?.availableEditors;
  const hasChatBackgroundImage =
    settings.chatBackgroundImageAssetId.length > 0 ||
    settings.chatBackgroundImageDataUrl.length > 0;
  const chatBackgroundPreview = useChatBackgroundImage(
    settings.chatBackgroundImageAssetId,
    settings.chatBackgroundImageDataUrl,
  );
  const hasChatBackgroundImageSource = chatBackgroundPreview.url !== null;
  const chatBackgroundFadePercent = clampChatBackgroundFadePercent(
    settings.chatBackgroundImageFadePercent,
  );
  const chatBackgroundBlurPx = clampChatBackgroundBlurPx(settings.chatBackgroundImageBlurPx);
  const chatBackgroundImageOpacity = Math.max(0, (100 - chatBackgroundFadePercent) / 100);

  const openKeybindingsFile = useCallback(() => {
    if (!keybindingsConfigPath) return;
    setOpenKeybindingsError(null);
    setIsOpeningKeybindings(true);
    const api = ensureNativeApi();
    const editor = resolveAndPersistPreferredEditor(availableEditors ?? []);
    if (!editor) {
      setOpenKeybindingsError(copy.noEditorsFound);
      setIsOpeningKeybindings(false);
      return;
    }
    void api.shell
      .openInEditor(keybindingsConfigPath, editor)
      .catch((error) => {
        setOpenKeybindingsError(
          error instanceof Error ? error.message : copy.openKeybindingsFailed,
        );
      })
      .finally(() => {
        setIsOpeningKeybindings(false);
      });
  }, [availableEditors, copy.noEditorsFound, copy.openKeybindingsFailed, keybindingsConfigPath]);

  const saveCustomModel = useCallback(
    (provider: ProviderKind, value: string) => {
      const customModels = getCustomModelsForProvider(settings, provider);
      const normalized = normalizeModelSlug(value, provider);
      if (!normalized) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: copy.enterModelSlug,
        }));
        return false;
      }
      if (getModelOptions(provider).some((option) => option.slug === normalized)) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: copy.modelAlreadyBuiltIn,
        }));
        return false;
      }
      if (normalized.length > MAX_CUSTOM_MODEL_LENGTH) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: copy.modelTooLong(MAX_CUSTOM_MODEL_LENGTH),
        }));
        return false;
      }
      if (customModels.includes(normalized)) {
        setCustomModelErrorByProvider((existing) => ({
          ...existing,
          [provider]: copy.customModelAlreadySaved,
        }));
        return false;
      }

      if (provider === "codex" && isCodexOpenRouterModel(normalized)) {
        if (!isOpenRouterGuaranteedFreeSlug(normalized)) {
          setCustomModelErrorByProvider((existing) => ({
            ...existing,
            codex: copy.openRouterMustBeFree,
          }));
          return false;
        }

        if (hasLiveOpenRouterCatalog) {
          const catalogEntry = openRouterModelsBySlug.get(normalized) ?? null;
          if (normalized !== OPENROUTER_FREE_ROUTER_MODEL && catalogEntry === null) {
            setCustomModelErrorByProvider((existing) => ({
              ...existing,
              codex: copy.openRouterNotInCatalog,
            }));
            return false;
          }
          if (catalogEntry && !supportsOpenRouterNativeToolCalling(catalogEntry)) {
            setCustomModelErrorByProvider((existing) => ({
              ...existing,
              codex: copy.openRouterNeedsTools,
            }));
            return false;
          }
        }
      }

      updateSettings(patchCustomModels(provider, [...customModels, normalized]));
      setCustomModelErrorByProvider((existing) => ({
        ...existing,
        [provider]: null,
      }));
      return true;
    },
    [copy, hasLiveOpenRouterCatalog, openRouterModelsBySlug, settings, updateSettings],
  );

  const addCustomModel = useCallback(
    (provider: ProviderKind) => {
      const customModelInput = customModelInputByProvider[provider];
      if (!saveCustomModel(provider, customModelInput)) {
        return;
      }

      setCustomModelInputByProvider((existing) => ({
        ...existing,
        [provider]: "",
      }));
    },
    [customModelInputByProvider, saveCustomModel],
  );

  const addOpenRouterCatalogModel = useCallback(
    (slug: string) => {
      saveCustomModel("codex", slug);
    },
    [saveCustomModel],
  );

  const resetOpenRouterCustomModels = useCallback(() => {
    updateSettings(
      patchCustomModels("codex", [...getDefaultCustomModelsForProvider(defaults, "codex")]),
    );
    setCustomModelErrorByProvider((existing) => ({
      ...existing,
      codex: null,
    }));
  }, [defaults, updateSettings]);

  const lastCheckedOpenRouterCatalogLabel = openRouterCatalogQuery.data
    ? new Intl.DateTimeFormat(languageLocale, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(openRouterCatalogQuery.data.fetchedAt))
    : null;

  const openRouterCatalogStatusMessage = openRouterCatalogQuery.isPending
    ? copy.openRouterChecking
    : hasLiveOpenRouterCatalog
      ? copy.openRouterAvailable(openRouterCatalogModelCount)
      : copy.openRouterUnavailable;

  const openRouterCatalogError =
    openRouterCatalogQuery.data?.status === "unavailable"
      ? openRouterCatalogQuery.data.message
      : null;

  const renderCustomModelsCard = (providerSettings: (typeof MODEL_PROVIDER_SETTINGS)[number]) => {
    const provider = providerSettings.provider;
    const providerCopy = copy.providerCards[provider];
    const customModels = getCustomModelsForProvider(settings, provider);
    const customModelInput = customModelInputByProvider[provider];
    const customModelError = customModelErrorByProvider[provider] ?? null;
    return (
      <div key={provider} className="rounded-xl border border-border bg-background/50 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-foreground">{providerCopy.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{providerCopy.description}</p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <label htmlFor={`custom-model-slug-${provider}`} className="block flex-1 space-y-1">
              <span className="text-xs font-medium text-foreground">{copy.customModelSlug}</span>
              <Input
                id={`custom-model-slug-${provider}`}
                dir="ltr"
                value={customModelInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setCustomModelInputByProvider((existing) => ({
                    ...existing,
                    [provider]: value,
                  }));
                  if (customModelError) {
                    setCustomModelErrorByProvider((existing) => ({
                      ...existing,
                      [provider]: null,
                    }));
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addCustomModel(provider);
                }}
                placeholder={providerSettings.placeholder}
                spellCheck={false}
              />
              <span className="text-xs text-muted-foreground">
                {copy.example}: <code>{providerSettings.example}</code>
              </span>
            </label>

            <Button className="sm:mt-6" type="button" onClick={() => addCustomModel(provider)}>
              {copy.addModel}
            </Button>
          </div>

          {customModelError ? <p className="text-xs text-destructive">{customModelError}</p> : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>{copy.savedCustomModels(customModels.length)}</p>
              {customModels.length > 0 ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    updateSettings(
                      patchCustomModels(provider, [
                        ...getDefaultCustomModelsForProvider(defaults, provider),
                      ]),
                    )
                  }
                >
                  {copy.resetCustomModels}
                </Button>
              ) : null}
            </div>

            {customModels.length > 0 ? (
              <div className="space-y-2">
                {customModels.map((slug) => (
                  <div
                    key={`${provider}:${slug}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <code className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {slug}
                      </code>
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => removeCustomModel(provider, slug)}
                    >
                      {copy.remove}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
                {copy.noCustomModels}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const removeCustomModel = useCallback(
    (provider: ProviderKind, slug: string) => {
      const customModels = getCustomModelsForProvider(settings, provider);
      updateSettings(
        patchCustomModels(
          provider,
          customModels.filter((model) => model !== slug),
        ),
      );
      setCustomModelErrorByProvider((existing) => ({
        ...existing,
        [provider]: null,
      }));
    },
    [settings, updateSettings],
  );

  const openChatBackgroundPicker = useCallback(() => {
    setChatBackgroundError(null);
    chatBackgroundFileInputRef.current?.click();
  }, []);

  const removeChatBackgroundImage = useCallback(() => {
    const existingAssetId = settings.chatBackgroundImageAssetId.trim();
    setChatBackgroundError(null);
    updateSettings({
      chatBackgroundImageDataUrl: defaults.chatBackgroundImageDataUrl,
      chatBackgroundImageAssetId: defaults.chatBackgroundImageAssetId,
      chatBackgroundImageName: defaults.chatBackgroundImageName,
    });
    if (chatBackgroundFileInputRef.current) {
      chatBackgroundFileInputRef.current.value = "";
    }
    if (existingAssetId) {
      void removeChatBackgroundBlob(existingAssetId).catch(() => undefined);
    }
  }, [
    defaults.chatBackgroundImageAssetId,
    defaults.chatBackgroundImageDataUrl,
    defaults.chatBackgroundImageName,
    settings.chatBackgroundImageAssetId,
    updateSettings,
  ]);

  const handleChatBackgroundFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";
      if (!file) {
        return;
      }

      if (!file.type.startsWith("image/")) {
        setChatBackgroundError(copy.chooseImageFile);
        return;
      }

      if (file.size > MAX_CHAT_BACKGROUND_IMAGE_BYTES) {
        setChatBackgroundError(copy.imageTooLarge(CHAT_BACKGROUND_IMAGE_SIZE_LIMIT_LABEL));
        return;
      }

      setChatBackgroundError(null);
      setIsUpdatingChatBackground(true);
      try {
        const nextAssetId = crypto.randomUUID();
        await saveChatBackgroundBlob(nextAssetId, file);
        const previousAssetId = settings.chatBackgroundImageAssetId.trim();
        const dataUrlCandidate =
          file.size <= MAX_CHAT_BACKGROUND_IMAGE_DATA_URL_LENGTH
            ? await readFileAsDataUrl(file)
            : "";
        updateSettings({
          chatBackgroundImageAssetId: nextAssetId,
          chatBackgroundImageDataUrl:
            dataUrlCandidate.length <= MAX_CHAT_BACKGROUND_IMAGE_DATA_URL_LENGTH
              ? dataUrlCandidate
              : "",
          chatBackgroundImageName: file.name || copy.backgroundImageFallbackName,
        });
        if (previousAssetId && previousAssetId !== nextAssetId) {
          void removeChatBackgroundBlob(previousAssetId).catch(() => undefined);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("IndexedDB")) {
          setChatBackgroundError(copy.browserPersistError);
        }
        if (!(error instanceof Error && error.message.includes("IndexedDB"))) {
          setChatBackgroundError(error instanceof Error ? error.message : copy.imageLoadFailed);
        }
      } finally {
        setIsUpdatingChatBackground(false);
      }
    },
    [copy, settings.chatBackgroundImageAssetId, updateSettings],
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-5">
            <ThreadSidebarToggle />
            <ThreadNewButton />
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              {copy.settingsLabel}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div dir={settingsDirection} className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <header className="flex items-start gap-3">
              {!isElectron ? (
                <div className="flex items-center gap-2">
                  <ThreadSidebarToggle className="mt-0.5" />
                  <ThreadNewButton className="mt-0.5" />
                </div>
              ) : null}
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {copy.settingsLabel}
                </h1>
                <p className="text-sm text-muted-foreground">{copy.settingsDescription}</p>
              </div>
            </header>

            <AppearanceSettingsSection />

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.chatBackgroundTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {copy.chatBackgroundDescription}
                </p>
              </div>

              <input
                ref={chatBackgroundFileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleChatBackgroundFileChange}
              />

              <div className="space-y-4">
                <div className="overflow-hidden rounded-xl border border-border bg-background/60">
                  {hasChatBackgroundImageSource ? (
                    <div className="aspect-[16/7] overflow-hidden">
                      <div
                        className="h-full w-full scale-105 bg-cover bg-center bg-no-repeat"
                        style={{
                          backgroundImage: `linear-gradient(180deg, rgb(0 0 0 / 8%), rgb(0 0 0 / 32%)), url(${chatBackgroundPreview.url})`,
                          filter: `blur(${chatBackgroundBlurPx}px)`,
                          opacity: chatBackgroundImageOpacity,
                        }}
                      />
                    </div>
                  ) : (
                    <div className="aspect-[16/7] bg-[linear-gradient(135deg,var(--color-neutral-200),transparent_55%),linear-gradient(180deg,var(--background),color-mix(in_srgb,var(--background)_80%,var(--primary)))] dark:bg-[linear-gradient(135deg,var(--color-neutral-800),transparent_55%),linear-gradient(180deg,var(--background),color-mix(in_srgb,var(--background)_88%,var(--primary)))]" />
                  )}

                  <div className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
                    <p>
                      {copy.status}:{" "}
                      <span className="font-medium text-foreground">
                        {hasChatBackgroundImage ? copy.customImageActive : copy.defaultBackground}
                      </span>
                    </p>
                    <p className="mt-1">
                      {copy.file}:{" "}
                      <span className="font-medium text-foreground">
                        {settings.chatBackgroundImageName || copy.none}
                      </span>
                    </p>
                    <p className="mt-1">
                      {copy.fade}:{" "}
                      <span className="font-medium text-foreground">
                        {chatBackgroundFadePercent}%
                      </span>
                    </p>
                    <p className="mt-1">
                      {copy.blur}:{" "}
                      <span className="font-medium text-foreground">{chatBackgroundBlurPx}px</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openChatBackgroundPicker}
                    disabled={isUpdatingChatBackground}
                  >
                    {isUpdatingChatBackground ? (
                      <LoaderCircleIcon className="size-4 animate-spin" />
                    ) : (
                      <ImagePlusIcon className="size-4" />
                    )}
                    {hasChatBackgroundImage ? copy.changeBackground : copy.addBackground}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={removeChatBackgroundImage}
                    disabled={!hasChatBackgroundImageSource || isUpdatingChatBackground}
                  >
                    <Trash2Icon className="size-4" />
                    {copy.removeBackground}
                  </Button>
                </div>

                <div className="space-y-4 rounded-xl border border-border bg-background/50 px-3 py-3">
                  <label className="block space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-foreground">{copy.fade}</span>
                      <span className="text-xs text-muted-foreground">
                        {chatBackgroundFadePercent}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={chatBackgroundFadePercent}
                      disabled={!hasChatBackgroundImageSource}
                      onChange={(event) =>
                        updateSettings({
                          chatBackgroundImageFadePercent: clampChatBackgroundFadePercent(
                            Number(event.target.value),
                          ),
                        })
                      }
                      className="w-full accent-primary disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label={copy.fade}
                    />
                    <p className="text-xs text-muted-foreground">{copy.fadeDescription}</p>
                  </label>

                  <label className="block space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-foreground">{copy.blur}</span>
                      <span className="text-xs text-muted-foreground">
                        {chatBackgroundBlurPx}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={MAX_CHAT_BACKGROUND_IMAGE_BLUR_PX}
                      step={1}
                      value={chatBackgroundBlurPx}
                      disabled={!hasChatBackgroundImageSource}
                      onChange={(event) =>
                        updateSettings({
                          chatBackgroundImageBlurPx: clampChatBackgroundBlurPx(
                            Number(event.target.value),
                          ),
                        })
                      }
                      className="w-full accent-primary disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label={copy.blur}
                    />
                    <p className="text-xs text-muted-foreground">{copy.blurDescription}</p>
                  </label>

                  {(chatBackgroundFadePercent !== DEFAULT_CHAT_BACKGROUND_IMAGE_FADE_PERCENT ||
                    chatBackgroundBlurPx !== DEFAULT_CHAT_BACKGROUND_IMAGE_BLUR_PX) && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          updateSettings({
                            chatBackgroundImageFadePercent:
                              DEFAULT_CHAT_BACKGROUND_IMAGE_FADE_PERCENT,
                            chatBackgroundImageBlurPx: DEFAULT_CHAT_BACKGROUND_IMAGE_BLUR_PX,
                          })
                        }
                      >
                        {copy.resetImageEffects}
                      </Button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {copy.imageStorageNote(CHAT_BACKGROUND_IMAGE_SIZE_LIMIT_LABEL)}
                </p>
                {chatBackgroundError ? (
                  <p className="text-xs text-destructive">{chatBackgroundError}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.codexTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.codexDescription}</p>
              </div>

              <div className="space-y-4">
                <label htmlFor="codex-binary-path" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">
                    {copy.codexBinaryPath}
                  </span>
                  <Input
                    id="codex-binary-path"
                    dir="ltr"
                    value={codexBinaryPath}
                    onChange={(event) => updateSettings({ codexBinaryPath: event.target.value })}
                    placeholder="codex"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">{copy.leaveBlankCodex}</span>
                </label>

                <label htmlFor="codex-home-path" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">{copy.codexHomePath}</span>
                  <Input
                    id="codex-home-path"
                    dir="ltr"
                    value={codexHomePath}
                    onChange={(event) => updateSettings({ codexHomePath: event.target.value })}
                    placeholder="/Users/you/.codex"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">{copy.codexHomeDescription}</span>
                </label>

                <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p>{copy.binarySource}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-foreground">
                      {codexBinaryPath || "PATH"}
                    </p>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    className="self-start"
                    onClick={() =>
                      updateSettings({
                        codexBinaryPath: defaults.codexBinaryPath,
                        codexHomePath: defaults.codexHomePath,
                      })
                    }
                  >
                    {copy.resetCodexOverrides}
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.openRouterTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.openRouterDescription}</p>
              </div>

              <div className="space-y-4">
                <label htmlFor="openrouter-api-key" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">
                    {copy.openRouterApiKey}
                  </span>
                  <Input
                    id="openrouter-api-key"
                    dir="ltr"
                    type="password"
                    value={openRouterApiKey}
                    onChange={(event) => updateSettings({ openRouterApiKey: event.target.value })}
                    placeholder="sk-or-..."
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">
                    {copy.openRouterKeyDescription(isElectron)}
                  </span>
                </label>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p>
                    {openRouterApiKey.trim().length > 0
                      ? copy.openRouterConfigured
                      : copy.openRouterMissing}
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        openRouterApiKey: defaults.openRouterApiKey,
                      })
                    }
                  >
                    {copy.resetOpenRouterKey}
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.copilotTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.copilotDescription}</p>
              </div>

              <div className="space-y-4">
                <label htmlFor="copilot-binary-path" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">
                    {copy.copilotBinaryPath}
                  </span>
                  <Input
                    id="copilot-binary-path"
                    dir="ltr"
                    value={copilotBinaryPath}
                    onChange={(event) => updateSettings({ copilotBinaryPath: event.target.value })}
                    placeholder="copilot"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">{copy.leaveBlankCopilot}</span>
                </label>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p>
                    Binary source:{" "}
                    <span className="font-medium text-foreground">
                      {copilotBinaryPath || "PATH"}
                    </span>
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        copilotBinaryPath: defaults.copilotBinaryPath,
                      })
                    }
                  >
                    {copy.resetCopilotOverrides}
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.opencodeTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.opencodeDescription}</p>
              </div>

              <div className="space-y-4">
                <label htmlFor="opencode-binary-path" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">
                    {copy.opencodeBinaryPath}
                  </span>
                  <Input
                    id="opencode-binary-path"
                    dir="ltr"
                    value={opencodeBinaryPath}
                    onChange={(event) => updateSettings({ opencodeBinaryPath: event.target.value })}
                    placeholder="opencode"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">{copy.leaveBlankOpencode}</span>
                </label>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p>
                    Binary source:{" "}
                    <span className="font-medium text-foreground">
                      {opencodeBinaryPath || "PATH"}
                    </span>
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        opencodeBinaryPath: defaults.opencodeBinaryPath,
                      })
                    }
                  >
                    {copy.resetOpencodeOverrides}
                  </Button>
                </div>

                <div className="pt-4 border-t border-border">
                  <OpenCodeCredentialsManager />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.kimiTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.kimiDescription}</p>
              </div>

              <div className="space-y-4">
                <label htmlFor="kimi-binary-path" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">{copy.kimiBinaryPath}</span>
                  <Input
                    id="kimi-binary-path"
                    dir="ltr"
                    value={kimiBinaryPath}
                    onChange={(event) => updateSettings({ kimiBinaryPath: event.target.value })}
                    placeholder="kimi"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">{copy.leaveBlankKimi}</span>
                </label>

                <label htmlFor="kimi-api-key" className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">{copy.kimiApiKey}</span>
                  <Input
                    id="kimi-api-key"
                    dir="ltr"
                    type="password"
                    value={kimiApiKey}
                    onChange={(event) => updateSettings({ kimiApiKey: event.target.value })}
                    placeholder="sk-kimi-..."
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <span className="text-xs text-muted-foreground">
                    {copy.kimiApiDescription(isElectron)}
                  </span>
                </label>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p>
                    Binary source:{" "}
                    <span className="font-medium text-foreground">{kimiBinaryPath || "PATH"}</span>
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        kimiBinaryPath: defaults.kimiBinaryPath,
                        kimiApiKey: defaults.kimiApiKey,
                      })
                    }
                  >
                    {copy.resetKimiOverrides}
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.modelsTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.modelsDescription}</p>
              </div>

              <div className="space-y-5">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">
                    {copy.defaultServiceTier}
                  </span>
                  <Select
                    items={APP_SERVICE_TIER_OPTIONS.map((option) => ({
                      label: copy.serviceTierOptions[option.value].label,
                      value: option.value,
                    }))}
                    value={codexServiceTier}
                    onValueChange={(value) => {
                      if (!value) return;
                      updateSettings({ codexServiceTier: value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      {APP_SERVICE_TIER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex min-w-0 items-center gap-2">
                            {option.value === "fast" ? (
                              <ZapIcon className="size-3.5 text-amber-500" />
                            ) : (
                              <span className="size-3.5 shrink-0" aria-hidden="true" />
                            )}
                            <span className="truncate">
                              {copy.serviceTierOptions[option.value].label}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {copy.serviceTierOptions[codexServiceTier].description}
                  </span>
                </label>

                <div className="rounded-xl border border-border bg-background/50 p-4">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">
                        {copy.openRouterFreeModelsTitle}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {copy.openRouterFreeModelsDescription(OPENROUTER_FREE_ROUTER_MODEL)}
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void openRouterCatalogQuery.refetch()}
                      disabled={openRouterCatalogQuery.isFetching}
                    >
                      {openRouterCatalogQuery.isFetching ? (
                        <LoaderCircleIcon className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="size-3.5" />
                      )}
                      {copy.refreshList}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                      <p>{openRouterCatalogStatusMessage}</p>
                      {openRouterCatalogQuery.data?.status === "available" ? (
                        <p className="mt-1">
                          {copy.openRouterFilteringNote(OPENROUTER_FREE_ROUTER_MODEL)}
                        </p>
                      ) : null}
                      {lastCheckedOpenRouterCatalogLabel ? (
                        <p className="mt-1">
                          {copy.lastCheckedAt(lastCheckedOpenRouterCatalogLabel)}
                        </p>
                      ) : null}
                      {openRouterCatalogError ? (
                        <p className="mt-2 text-destructive">{openRouterCatalogError}</p>
                      ) : null}
                    </div>

                    <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-border bg-background p-2">
                      {compatibleOpenRouterFreeModels.map((model) => {
                        const isBuiltIn = model.slug === OPENROUTER_FREE_ROUTER_MODEL;
                        const isSaved = savedOpenRouterModels.includes(model.slug);
                        return (
                          <div
                            key={model.slug}
                            className="flex flex-col gap-3 rounded-lg border border-border bg-background/70 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  {model.name}
                                </span>
                                {model.source === "router" ? renderCapabilityBadge("Router") : null}
                                {model.contextLength !== null
                                  ? renderCapabilityBadge(
                                      `${formatCompactTokenCount(model.contextLength)} ctx`,
                                    )
                                  : null}
                                {model.supportsTools ? renderCapabilityBadge("Tools") : null}
                                {model.supportsReasoning
                                  ? renderCapabilityBadge("Reasoning")
                                  : null}
                                {model.supportsImages ? renderCapabilityBadge("Vision") : null}
                              </div>
                              <code className="mt-1 block min-w-0 truncate text-xs text-muted-foreground">
                                {model.slug}
                              </code>
                              {model.description ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {model.description}
                                </p>
                              ) : null}
                            </div>

                            <Button
                              size="xs"
                              variant={isBuiltIn || isSaved ? "outline" : "secondary"}
                              disabled={isBuiltIn || isSaved}
                              onClick={() => addOpenRouterCatalogModel(model.slug)}
                            >
                              {isBuiltIn ? copy.builtIn : isSaved ? copy.saved : copy.addToPicker}
                            </Button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <label
                        htmlFor="custom-model-slug-openrouter"
                        className="block flex-1 space-y-1"
                      >
                        <span className="text-xs font-medium text-foreground">
                          {copy.additionalCodexModelSlug}
                        </span>
                        <Input
                          id="custom-model-slug-openrouter"
                          dir="ltr"
                          value={openRouterCustomModelInput}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCustomModelInputByProvider((existing) => ({
                              ...existing,
                              codex: value,
                            }));
                            if (openRouterCustomModelError) {
                              setCustomModelErrorByProvider((existing) => ({
                                ...existing,
                                codex: null,
                              }));
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            addCustomModel("codex");
                          }}
                          placeholder="meta-llama/llama-3.3-70b-instruct:free"
                          spellCheck={false}
                        />
                        <span className="text-xs text-muted-foreground">
                          {copy.additionalCodexModelHelp}
                        </span>
                      </label>

                      <Button
                        className="sm:mt-6"
                        type="button"
                        onClick={() => addCustomModel("codex")}
                      >
                        {copy.addModel}
                      </Button>
                    </div>

                    {openRouterCustomModelError ? (
                      <p className="text-xs text-destructive">{openRouterCustomModelError}</p>
                    ) : null}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <p>{copy.savedCodexOpenRouterCount(savedOpenRouterModels.length)}</p>
                        {savedOpenRouterModels.length > 0 ? (
                          <Button size="xs" variant="outline" onClick={resetOpenRouterCustomModels}>
                            {copy.resetSavedCodexOpenRouter}
                          </Button>
                        ) : null}
                      </div>

                      {savedOpenRouterModels.length > 0 ? (
                        <div className="space-y-2">
                          {savedOpenRouterModels.map((slug) => {
                            const warning = savedOpenRouterModelWarnings.get(slug) ?? null;
                            return (
                              <div
                                key={`openrouter:${slug}`}
                                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <code className="block min-w-0 truncate text-xs text-foreground">
                                    {slug}
                                  </code>
                                  {warning ? (
                                    <p className="mt-1 text-[11px] text-destructive">{warning}</p>
                                  ) : null}
                                </div>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => removeCustomModel("codex", slug)}
                                >
                                  {copy.remove}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
                          {copy.noSavedCodexOpenRouter}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {MODEL_PROVIDER_SETTINGS.map(renderCustomModelsCard)}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.threadsTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.threadsDescription}</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{copy.defaultToNewWorktree}</p>
                  <p className="text-xs text-muted-foreground">
                    {copy.defaultToNewWorktreeDescription}
                  </p>
                </div>
                <Switch
                  checked={settings.defaultThreadEnvMode === "worktree"}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      defaultThreadEnvMode: checked ? "worktree" : "local",
                    })
                  }
                  aria-label={copy.defaultToNewWorktree}
                />
              </div>

              {settings.defaultThreadEnvMode !== defaults.defaultThreadEnvMode ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        defaultThreadEnvMode: defaults.defaultThreadEnvMode,
                      })
                    }
                  >
                    {copy.restoreDefault}
                  </Button>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.responsesTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.responsesDescription}</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {copy.streamAssistantMessages}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {copy.streamAssistantMessagesDescription}
                  </p>
                </div>
                <Switch
                  checked={settings.enableAssistantStreaming}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      enableAssistantStreaming: Boolean(checked),
                    })
                  }
                  aria-label={copy.streamAssistantMessages}
                />
              </div>

              {settings.enableAssistantStreaming !== defaults.enableAssistantStreaming ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        enableAssistantStreaming: defaults.enableAssistantStreaming,
                      })
                    }
                  >
                    {copy.restoreDefault}
                  </Button>
                </div>
              ) : null}
            </section>

            <PermissionPoliciesSection
              rules={settings.approvalRules}
              defaultRules={defaults.approvalRules}
              projects={projects}
              activeProjectId={activeProjectId}
              onChangeRules={(approvalRules) => updateSettings({ approvalRules })}
            />

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.keybindingsTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.keybindingsDescription}</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{copy.configFilePath}</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                      {keybindingsConfigPath ?? copy.resolvingKeybindingsPath}
                    </p>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!keybindingsConfigPath || isOpeningKeybindings}
                    onClick={openKeybindingsFile}
                  >
                    {isOpeningKeybindings ? copy.opening : copy.openKeybindings}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">{copy.opensInPreferredEditor}</p>
                {openKeybindingsError ? (
                  <p className="text-xs text-destructive">{openKeybindingsError}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.safetyTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.safetyDescription}</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {copy.confirmThreadDeletion}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {copy.confirmThreadDeletionDescription}
                  </p>
                </div>
                <Switch
                  checked={settings.confirmThreadDelete}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      confirmThreadDelete: Boolean(checked),
                    })
                  }
                  aria-label={copy.confirmThreadDeletion}
                />
              </div>

              {settings.confirmThreadDelete !== defaults.confirmThreadDelete ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      updateSettings({
                        confirmThreadDelete: defaults.confirmThreadDelete,
                      })
                    }
                  >
                    {copy.restoreDefault}
                  </Button>
                </div>
              ) : null}
            </section>
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground">{copy.aboutTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{copy.aboutDescription}</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{copy.version}</p>
                  <p className="text-xs text-muted-foreground">{copy.versionDescription}</p>
                </div>
                <code className="text-xs font-medium text-muted-foreground">{APP_VERSION}</code>
              </div>
            </section>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/settings")({
  component: SettingsRouteView,
});
