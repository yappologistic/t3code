const DB_NAME = "rowl-assets";
const DB_VERSION = 1;
const STORE_NAME = "chat-background-images";

interface StoredChatBackgroundImageRecord {
  id: string;
  blob: Blob;
}

function openChatBackgroundDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser does not support IndexedDB storage."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Failed to open the chat background image store."));
    });
  });
}

export async function saveChatBackgroundBlob(id: string, blob: Blob): Promise<void> {
  const database = await openChatBackgroundDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put({ id, blob } satisfies StoredChatBackgroundImageRecord);
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => {
      reject(transaction.error ?? new Error("Failed to save the chat background image."));
    });
    transaction.addEventListener("abort", () => {
      reject(transaction.error ?? new Error("Saving the chat background image was aborted."));
    });
  }).finally(() => {
    database.close();
  });
}

export async function loadChatBackgroundBlob(id: string): Promise<Blob | null> {
  const database = await openChatBackgroundDatabase();

  return await new Promise<Blob | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.addEventListener("success", () => {
      const result = request.result as StoredChatBackgroundImageRecord | undefined;
      resolve(result?.blob ?? null);
    });
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Failed to load the chat background image."));
    });
  }).finally(() => {
    database.close();
  });
}

export async function removeChatBackgroundBlob(id: string): Promise<void> {
  const database = await openChatBackgroundDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => {
      reject(transaction.error ?? new Error("Failed to remove the chat background image."));
    });
    transaction.addEventListener("abort", () => {
      reject(transaction.error ?? new Error("Removing the chat background image was aborted."));
    });
  }).finally(() => {
    database.close();
  });
}
