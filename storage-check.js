// Storage Inspector - Console Commands
// Run these in your browser console to check storage

console.log("=== STORAGE INSPECTOR ===");

// Check LocalStorage
console.log("\n--- LocalStorage Data ---");
if (localStorage.length === 0) {
  console.log("No localStorage data found");
} else {
  console.log(`Found ${localStorage.length} localStorage items:`);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    console.log(`Key: ${key}`);
    console.log(`Value: ${value}`);
    console.log("---");
  }
}

// Check IndexedDB
console.log("\n--- IndexedDB Data ---");
if (!window.indexedDB) {
  console.log("IndexedDB not supported");
} else {
  const request = indexedDB.open("BIKE", 1);

  request.onerror = function () {
    console.log("Could not open IndexedDB");
  };

  request.onsuccess = function (event) {
    const db = event.target.result;
    console.log("IndexedDB opened successfully");

    const objectStores = Array.from(db.objectStoreNames);
    console.log(`Object Stores: ${objectStores.join(", ")}`);

    if (objectStores.length === 0) {
      console.log("No object stores found");
      return;
    }

    objectStores.forEach((storeName) => {
      const transaction = db.transaction([storeName], "readonly");
      const objectStore = transaction.objectStore(storeName);
      const request = objectStore.getAll();

      request.onsuccess = function () {
        const data = request.result;
        console.log(`\nStore: ${storeName}`);
        console.log(`Records: ${data.length}`);

        if (data.length > 0) {
          data.forEach((item, index) => {
            console.log(`Record ${index + 1}:`, item);
          });
        }
      };

      request.onerror = function () {
        console.log(`Error reading from store: ${storeName}`);
      };
    });
  };

  request.onupgradeneeded = function () {
    console.log("IndexedDB needs upgrade - no data found");
  };
}

// Check SessionStorage
console.log("\n--- SessionStorage Data ---");
if (sessionStorage.length === 0) {
  console.log("No sessionStorage data found");
} else {
  console.log(`Found ${sessionStorage.length} sessionStorage items:`);
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    const value = sessionStorage.getItem(key);
    console.log(`Key: ${key}`);
    console.log(`Value: ${value}`);
    console.log("---");
  }
}

console.log("\n=== END STORAGE INSPECTOR ===");
