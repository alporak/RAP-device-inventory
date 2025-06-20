// This script contains all the logic for the Device Inventory application.
// It uses Firebase for authentication and database services and html5-qrcode for scanning.

// Import necessary Firebase modules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, Timestamp, setLogLevel, getDoc, setDoc, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
const envFirebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const hardcodedFirebaseConfig = { 
    apiKey: "AIzaSyDvnfIehUU8oT80-7g-h7di0RXc4DHtE4Y",
    authDomain: "rap-stash.firebaseapp.com",
    projectId: "rap-stash",
    storageBucket: "rap-stash.appspot.com",
    messagingSenderId: "736536221160",
    appId: "1:736536221160:web:8edeb946dab0ca4182405d",
    measurementId: "G-W4JEBQYSCF"
};
const firebaseConfig = Object.keys(envFirebaseConfig).length > 0 ? envFirebaseConfig : hardcodedFirebaseConfig;

if (Object.keys(firebaseConfig).length === 0 && Object.keys(hardcodedFirebaseConfig).length === 0) {
    document.getElementById('app-container').innerHTML = `<div class="text-center p-8"><h1 class="text-2xl font-bold text-red-600">Firebase Configuration Missing</h1><p class="mt-4 text-neutral-content">Please provide your Firebase project configuration.</p></div>`;
    throw new Error("Firebase configuration is missing.");
}

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setLogLevel('debug');

// --- Firestore Collection Paths ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const devicesCollectionPath = `artifacts/${appId}/public/data/devices`;
const teamMembersCollectionPath = `artifacts/${appId}/public/data/team_members`;
const devicesCol = collection(db, devicesCollectionPath);
const teamMembersCol = collection(db, teamMembersCollectionPath);

// --- Constants & Global State ---
const ROLES = {
    ESD_TEAM_LEAD: 'ESD Team Lead',
    ESD_MEMBER: 'ESD Member',
    QA_TEAM_LEAD: 'QA Team Lead',
    QA_MEMBER: 'QA Member',
};
const LEAD_ROLES = [ROLES.ESD_TEAM_LEAD, ROLES.QA_TEAM_LEAD];

let currentUser = { uid: null, name: null, role: null, isTeamMember: false, isLead: false };
let allDevices = [];
let allTeamMembers = []; 
const CACHE_EXPIRY_MS = 5 * 60 * 1000;
let currentCategoryFilter = '';
let compactMode = true;
let veryCompactMode = false;
let html5QrCode = null; // To hold the scanner instance

// --- DOM Element References ---
let deviceContainer, searchInput, sortCategorySelect, compactToggleButton, veryCompactToggleButton, themeToggleButton, themeToggleEmoji;
let reservationModal, nameInputForReservation, confirmReservationButton, cancelReservationButton, deviceIdToReserveInput;
let userIdDisplay, loadingIndicator, messageModal, messageText, closeMessageButton;
let deviceManagementModal, deviceManagementTitle, addDeviceView, editDeviceView, bulkAddDevicesView;
let newDeviceNameInput, newDeviceCategoryInput, newDeviceIMEIInput, newDeviceIndexInput, newDeviceLocationInput, newDeviceNotesInput;
let confirmAddDeviceButton, backToDeviceManageFromAddBtn;
let editDeviceNameInput, editDeviceCategoryInput, editDeviceIMEIInput, editDeviceIndexInput, editDeviceLocationInput, editDeviceNotesInput;
let confirmEditDeviceButton, backToDeviceManageFromEditBtn, editDeviceIdInput, removeDeviceFromEditModalButton;
let bulkDevicesTextarea, confirmBulkAddDevicesButton, backToDeviceManageFromBulkBtn;
let openDeviceManagementButton;
let userSettingsButton, userManagementModal, addUserView, newMemberUidInput, newMemberNameInput, newMemberRoleSelect;
let confirmAddUserButton, backToUserManageFromAddBtn, manageUsersView, usersTableBody, closeManageUsersButton, showAddUserViewBtn;
let editUserView, editUserIdInput, editUserNameInput, editUserRoleSelect, confirmEditUserButton, removeUserButtonInEditModal, backToUserManageFromEditBtn, editUserTitle;
let confirmationModal, confirmationMessageText, confirmActionButton, cancelActionButton;
let scanQRCodeButton, scanModal, closeScanModalButton, scannerContainer, scannedDeviceContainer, qrReaderResults;


/**
 * Grabs all necessary DOM elements from the page and assigns them to the global variables.
 */
function initializeDOMElements() {
    // Main UI
    deviceContainer = document.getElementById('deviceContainer');
    searchInput = document.getElementById('searchInput');
    sortCategorySelect = document.getElementById('sortCategorySelect');
    compactToggleButton = document.getElementById('compactToggleButton');
    veryCompactToggleButton = document.getElementById('veryCompactToggleButton');
    themeToggleButton = document.getElementById('themeToggleButton');
    themeToggleEmoji = document.getElementById('themeToggleEmoji');
    userIdDisplay = document.getElementById('userIdDisplay');
    loadingIndicator = document.getElementById('loadingIndicator');
    
    // Modals & General Controls
    messageModal = document.getElementById('messageModal');
    messageText = document.getElementById('messageText');
    closeMessageButton = document.getElementById('closeMessageButton');
    confirmationModal = document.getElementById('confirmationModal');
    confirmationMessageText = document.getElementById('confirmationMessageText');
    confirmActionButton = document.getElementById('confirmActionButton');
    cancelActionButton = document.getElementById('cancelActionButton');

    // QR Scanner Modal
    scanQRCodeButton = document.getElementById('scanQRCodeButton');
    scanModal = document.getElementById('scanModal');
    closeScanModalButton = document.getElementById('closeScanModalButton');
    scannerContainer = document.getElementById('scanner-container');
    scannedDeviceContainer = document.getElementById('scanned-device-container');
    qrReaderResults = document.getElementById('qr-reader-results');

    // Reservation Modal
    reservationModal = document.getElementById('reservationModal');
    nameInputForReservation = document.getElementById('nameInputForReservation');
    confirmReservationButton = document.getElementById('confirmReservationButton');
    cancelReservationButton = document.getElementById('cancelReservationButton');
    deviceIdToReserveInput = document.getElementById('deviceIdToReserve');

    // Device Management Modal
    openDeviceManagementButton = document.getElementById('openDeviceManagementButton');
    deviceManagementModal = document.getElementById('deviceManagementModal');
    deviceManagementTitle = document.getElementById('deviceManagementTitle');
    addDeviceView = document.getElementById('addDeviceView');
    editDeviceView = document.getElementById('editDeviceView');
    bulkAddDevicesView = document.getElementById('bulkAddDevicesView');
    newDeviceNameInput = document.getElementById('newDeviceName');
    newDeviceCategoryInput = document.getElementById('newDeviceCategory');
    newDeviceIMEIInput = document.getElementById('newDeviceIMEI');
    newDeviceIndexInput = document.getElementById('newDeviceIndex');
    newDeviceLocationInput = document.getElementById('newDeviceLocation');
    newDeviceNotesInput = document.getElementById('newDeviceNotes');
    confirmAddDeviceButton = document.getElementById('confirmAddDeviceButton');
    backToDeviceManageFromAddBtn = document.getElementById('backToDeviceManageFromAddBtn');
    editDeviceNameInput = document.getElementById('editDeviceName');
    editDeviceCategoryInput = document.getElementById('editDeviceCategory');
    editDeviceIMEIInput = document.getElementById('editDeviceIMEI');
    editDeviceIndexInput = document.getElementById('editDeviceIndex');
    editDeviceLocationInput = document.getElementById('editDeviceLocation');
    editDeviceNotesInput = document.getElementById('editDeviceNotes');
    confirmEditDeviceButton = document.getElementById('confirmEditDeviceButton');
    backToDeviceManageFromEditBtn = document.getElementById('backToDeviceManageFromEditBtn');
    editDeviceIdInput = document.getElementById('editDeviceId');
    removeDeviceFromEditModalButton = document.getElementById('removeDeviceFromEditModalButton');
    bulkDevicesTextarea = document.getElementById('bulkDevicesTextarea');
    confirmBulkAddDevicesButton = document.getElementById('confirmBulkAddDevicesButton');
    backToDeviceManageFromBulkBtn = document.getElementById('backToDeviceManageFromBulkBtn');
    
    // User Settings / Management Controls
    userSettingsButton = document.getElementById('userSettingsButton');
    userManagementModal = document.getElementById('userManagementModal');
    manageUsersView = document.getElementById('manageUsersView');
    usersTableBody = document.getElementById('usersTableBody');
    closeManageUsersButton = document.getElementById('closeUserManagementButton');
    showAddUserViewBtn = document.getElementById('showAddUserViewBtn');
    addUserView = document.getElementById('addUserViewContent');
    newMemberUidInput = document.getElementById('newMemberUid');
    newMemberNameInput = document.getElementById('newMemberName');
    newMemberRoleSelect = document.getElementById('newMemberRoleSelect');
    confirmAddUserButton = document.getElementById('confirmAddUserButton');
    backToUserManageFromAddBtn = document.getElementById('backToUserManageFromAddBtn');
    editUserView = document.getElementById('editUserViewContent');
    editUserTitle = document.getElementById('editUserTitle');
    editUserIdInput = document.getElementById('editUserId');
    editUserNameInput = document.getElementById('editUserName');
    editUserRoleSelect = document.getElementById('editUserRoleSelect');
    confirmEditUserButton = document.getElementById('confirmEditUserButton');
    removeUserButtonInEditModal = document.getElementById('removeUserButtonInEditModal');
    backToUserManageFromEditBtn = document.getElementById('backToUserManageFromEditBtn');

    populateRoleSelect(newMemberRoleSelect);
    populateRoleSelect(editUserRoleSelect);
}

/**
 * Dynamically fills a <select> dropdown with roles.
 * @param {HTMLSelectElement} selectElement The <select> element to populate.
 */
function populateRoleSelect(selectElement) {
    if (!selectElement) return;
    selectElement.innerHTML = ''; 
    for (const roleKey in ROLES) {
        const option = document.createElement('option');
        option.value = ROLES[roleKey];
        option.textContent = ROLES[roleKey];
        selectElement.appendChild(option);
    }
}

/**
 * Fetches the profile of the currently logged-in user from the 'team_members' collection.
 * @param {string} userId The UID of the user to fetch.
 */
async function fetchCurrentUserProfile(userId) {
    if (!userId) {
        currentUser = { uid: null, name: null, role: null, isTeamMember: false, isLead: false };
        updateUIAccess();
        return;
    }
    try {
        const userDocRef = doc(db, teamMembersCollectionPath, userId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            currentUser.uid = userId;
            currentUser.name = userData.name || 'N/A'; 
            currentUser.role = userData.role || ROLES.ESD_MEMBER; 
            currentUser.isTeamMember = true;
            currentUser.isLead = LEAD_ROLES.includes(currentUser.role);
            console.log(`User ${userId} profile loaded: Name: ${currentUser.name}, Role: ${currentUser.role}, IsLead: ${currentUser.isLead}`);
        } else {
            currentUser = { uid: userId, name: 'Guest', role: null, isTeamMember: false, isLead: false };
            console.log(`User ${userId} not found in team_members. Treating as guest.`);
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
        showMessage(`Error fetching profile: ${error.message}`, true);
        currentUser = { uid: userId, name: 'Error', role: null, isTeamMember: false, isLead: false };
    }
    updateUIAccess();
}

/**
 * Updates the visibility of UI elements based on the current user's role and permissions.
 */
function updateUIAccess() {
    const commonControlsDisplay = currentUser.isTeamMember ? 'block' : 'none';
    const leadControlsDisplay = currentUser.isLead ? 'block' : 'none';

    if (openDeviceManagementButton) openDeviceManagementButton.style.display = leadControlsDisplay;
    if (userSettingsButton) userSettingsButton.style.display = commonControlsDisplay; 

    if (compactToggleButton) {
        compactToggleButton.disabled = veryCompactMode;
         if(veryCompactMode) compactToggleButton.classList.add('opacity-50', 'cursor-not-allowed');
         else compactToggleButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    filterAndRenderDevices(); 
    if (currentUser.isLead) fetchAllTeamMembers(); 
}

/**
 * Initializes Firebase Authentication, setting persistence and handling user state changes.
 */
async function initializeAuth() {
    try {
        await setPersistence(auth, browserLocalPersistence);
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                await fetchCurrentUserProfile(user.uid); 
                if (userIdDisplay) userIdDisplay.textContent = `User ID: ${currentUser.uid} (${currentUser.name} - ${currentUser.role || 'No Role'})`;
                console.log("User signed in with UID:", currentUser.uid);
                loadDevices(); 
                handleDirectURLActions();
            } else {
                currentUser = { uid: null, name: null, role: null, isTeamMember: false, isLead: false };
                if (userIdDisplay) userIdDisplay.textContent = "User ID: Not signed in";
                console.log("No user signed in. Attempting to sign in...");
                if (deviceContainer) deviceContainer.innerHTML = `<p class="text-neutral-muted col-span-full text-center py-8">Attempting to sign in...</p>`;

                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    try { await signInWithCustomToken(auth, __initial_auth_token); } 
                    catch (customTokenError) { console.error("Custom token sign-in failed, trying anonymous:", customTokenError); await signInAnonymously(auth); }
                } else {
                    await signInAnonymously(auth);
                }
            }
        });
    } catch (error) {
        console.error("Authentication error:", error);
        showMessage(`Authentication error: ${error.message}`, true);
        if (userIdDisplay) userIdDisplay.textContent = "User ID: Auth Error";
        currentUser = { uid: null, name: 'Auth Error', role: null, isTeamMember: false, isLead: false };
        updateUIAccess();
        if (deviceContainer) deviceContainer.innerHTML = `<p class="text-red-500 col-span-full text-center py-8">Authentication error. Cannot load devices.</p>`;
    }
}

/**
 * Handles actions specified in the URL, like releasing or finding a device.
 */
function handleDirectURLActions() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const deviceId = urlParams.get('deviceId');

    // Handle finding a device by ID from URL
    if (deviceId && !action) {
        console.log(`URL action: Highlighting device ${deviceId}`);
        // Use a timeout to ensure devices are loaded before we search
        setTimeout(() => {
            const deviceCard = document.querySelector(`.device-card[data-device-id="${deviceId}"]`);
            if (deviceCard) {
                deviceCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                deviceCard.classList.add('scanned-device-card'); // Use a special highlight class
                setTimeout(() => deviceCard.classList.remove('scanned-device-card'), 3000);
            } else {
                showMessage(`Device with ID ${deviceId} not found.`, true);
            }
             window.history.replaceState({}, document.title, window.location.pathname);
        }, 1500);
    }
    
    // Handle releasing a device from URL
    if (action === 'release' && deviceId) {
        if (currentUser.isTeamMember) {
            console.log(`Direct action: Attempting to release device ${deviceId}`);
            setTimeout(() => {
                releaseDevice(deviceId, true); 
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 1000);
           
        } else {
            showMessage("You need to be a team member to release a device via direct link. Please ensure you are logged in.", true);
        }
    }
}

/**
 * Retrieves device data from localStorage if it's not expired.
 * @returns {Array|null} The cached device data or null.
 */
function getCachedDevices() { 
    const cachedData = localStorage.getItem('cachedDevices');
    const cacheTimestamp = localStorage.getItem('cacheTimestamp');
    if (cachedData && cacheTimestamp) {
        if (Date.now() - parseInt(cacheTimestamp) < CACHE_EXPIRY_MS) {
            console.log("Using cached devices.");
            return JSON.parse(cachedData);
        }
    }
    console.log("Cache empty or expired.");
    return null;
}

/**
 * Saves device data to localStorage.
 * @param {Array} devices The array of devices to cache.
 */
function setCachedDevices(devices) {
    localStorage.setItem('cachedDevices', JSON.stringify(devices));
    localStorage.setItem('cacheTimestamp', Date.now().toString());
    console.log("Devices cached.");
}

/**
 * Loads devices from cache or Firestore and sets up a real-time listener for updates.
 */
function loadDevices() {
    if (!currentUser.uid) {
        console.log("User not authenticated, cannot fetch devices.");
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (deviceContainer && deviceContainer.innerHTML.trim() === '') {
             deviceContainer.innerHTML = `<p class="text-neutral-muted col-span-full text-center py-8">Authenticating user...</p>`;
        }
        return;
    }
    
    const cached = getCachedDevices();
    if (cached) {
        allDevices = cached.map(d => ({
            ...d,
            reservationDate: d.reservationDate && d.reservationDate.seconds ? Timestamp.fromDate(new Date(d.reservationDate.seconds * 1000)) : null,
            addedDate: d.addedDate && d.addedDate.seconds ? Timestamp.fromDate(new Date(d.addedDate.seconds * 1000)) : null
        }));
        populateCategoryDropdown();
        filterAndRenderDevices();
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    } else {
         if (loadingIndicator) loadingIndicator.style.display = 'flex';
    }

    onSnapshot(devicesCol, (snapshot) => {
        allDevices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allDevices.sort((a, b) => (a.index || 0) - (b.index || 0));
        
        setCachedDevices(allDevices.map(d => ({ 
            ...d,
            reservationDate: d.reservationDate ? { seconds: d.reservationDate.seconds, nanoseconds: d.reservationDate.nanoseconds } : null,
            addedDate: d.addedDate ? { seconds: d.addedDate.seconds, nanoseconds: d.addedDate.nanoseconds } : null
        })));

        populateCategoryDropdown();
        filterAndRenderDevices(); 
        console.log("Fetched/Updated devices from Firestore:", allDevices.length);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }, (error) => {
        console.error("Error fetching devices: ", error);
        showMessage(`Guests will not be able to view devices. Please register by contacting an admin.`, true);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (deviceContainer) deviceContainer.innerHTML = `<p class="text-red-500 col-span-full text-center py-8">Guests will not be able to view devices. Please register by contacting an admin.</p>`;
    });
}

/**
 * Creates and appends a single device card to the specified container.
 * @param {object} device The device data object.
 * @param {HTMLElement} container The parent element to append the card to.
 * @param {boolean} isScannedView True if this card is being rendered in the scanner modal.
 */
function renderSingleDeviceCard(device, container, isScannedView = false) {
    const deviceCard = document.createElement('div');
    // Add a unique data attribute to each card
    deviceCard.dataset.deviceId = device.id;
    deviceCard.className = `device-card p-6 rounded-xl shadow-lg flex flex-col justify-between ${compactMode && !isScannedView ? 'compact' : ''} ${isScannedView ? 'scanned-device-card' : ''}`;
    if (compactMode && !isScannedView) deviceCard.style.cursor = 'pointer';

    let notesHtml = device.notes && device.notes.trim() ? `<p class="text-sm text-neutral-content mb-2"><strong>Notes:</strong> ${device.notes}</p>` : '<p class="text-sm text-neutral-muted mb-2">No notes.</p>';
    let locationHtml = device.location && device.location.trim() ? `<p class="text-sm text-neutral-content mb-1"><strong class="font-medium">Location:</strong> ${device.location}</p>` : '<p class="text-sm text-neutral-muted mb-1">Location not set.</p>';
    let reservationStatusHtml = '';
    if (device.reservedByName) { 
        const reservationDate = device.reservationDate?.toDate ? device.reservationDate.toDate().toLocaleDateString() : 'N/A';
        reservationStatusHtml = `<p class="text-sm font-semibold text-danger">Reserved by: ${device.reservedByName}</p><p class="text-xs text-red-400">On: ${reservationDate}</p>`;
    } else {
        reservationStatusHtml = `<p class="text-sm font-semibold text-green-500">Available</p>`;
    }

    const mainActionBtnHtml = generateButtonHtml(device);
    let actionButtonsHtml = '';

    if (!compactMode || isScannedView) {
        actionButtonsHtml = mainActionBtnHtml;
        if (currentUser.isLead) { 
            actionButtonsHtml += `<button data-device-id="${device.id}" class="edit-device-btn-trigger w-full bg-neutral-500 hover:bg-neutral-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-150 ease-in-out mt-2">Edit</button>`;
        }
    } else {
        let compactActionsContent = mainActionBtnHtml;
        if (currentUser.isLead) { 
            compactActionsContent += `<button data-device-id="${device.id}" class="edit-device-btn-trigger w-full bg-neutral-500 hover:bg-neutral-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-150 ease-in-out mt-2">Edit</button>`;
        }
        actionButtonsHtml = `<div class="compact-actions hidden">${compactActionsContent}</div>`;
    }

    deviceCard.innerHTML = `
        <div>
            <div class="flex items-center mb-1">
                <span class="text-xs font-bold text-accent dark:text-accent-dark bg-neutral-100 dark:bg-neutral-700 rounded px-2 py-0.5 mr-2">#${device.index !== undefined ? device.index : 'N/A'}</span>
                <h3 class="text-xl font-semibold text-primary mb-0">${device.name || 'N/A'}</h3>
            </div>
            <p class="text-xs text-neutral-muted uppercase tracking-wider mb-2">${device.category || 'Uncategorized'}</p>
            <p class="text-sm text-neutral-content mb-1"><strong class="font-medium">IMEI:</strong> ${device.imei || 'N/A'}</p>
            ${locationHtml}
            ${notesHtml}
            ${reservationStatusHtml}
        </div>
        <div class="mt-4 flex flex-col gap-2">
            ${actionButtonsHtml}
        </div>`;
    container.appendChild(deviceCard);

    if (compactMode && !isScannedView) {
        deviceCard.addEventListener('click', function (e) {
            if (e.target.closest('button')) return; 
            const actions = deviceCard.querySelector('.compact-actions');
            if (actions) actions.classList.toggle('hidden');
        });
    }
}

/**
 * Renders the lists of devices.
 * @param {Array} devicesToRender The filtered list of devices to display.
 * @param {Array} reservedByCurrentUser The list of devices reserved by the logged-in user.
 */
function renderDevices(devicesToRender, reservedByCurrentUser) {
    if (!deviceContainer) return;
    deviceContainer.innerHTML = ''; 

    // Section for devices reserved by the current user
    if (reservedByCurrentUser.length > 0) {
        const reservedSection = document.createElement('div');
        reservedSection.id = 'reservedByCurrentUserSection';
        
        const title = document.createElement('h2');
        title.className = 'section-title';
        title.textContent = "You've Reserved";
        reservedSection.appendChild(title);

        const reservedGrid = document.createElement('div');
        reservedGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6';
        reservedByCurrentUser.forEach(device => renderSingleDeviceCard(device, reservedGrid, true));
        reservedSection.appendChild(reservedGrid);
        deviceContainer.appendChild(reservedSection);
    }
        // Separator
    if (devicesToRender.length > 0 && reservedByCurrentUser.length > 0) {
        const separator = document.createElement('hr');
        separator.className = 'my-8 border-neutral-300 dark:border-neutral-600';
        deviceContainer.appendChild(separator);
    }
    // Section for all other devices
    if (devicesToRender.length > 0) {
        const allDevicesSection = document.createElement('div');
        const title = document.createElement('h2');
        title.className = 'section-title';
        title.textContent = "All Devices";
        allDevicesSection.appendChild(title);

        if (veryCompactMode) {
            let table = document.createElement('table');
            table.className = "min-w-full text-xs border border-neutral-300 dark:border-darkborder bg-white dark:bg-darkcard rounded-xl overflow-hidden";
            let thead = document.createElement('thead');
            thead.innerHTML = `<tr class="bg-neutral-100 dark:bg-neutral-700">
                <th class="px-2 py-1 text-left text-neutral-content">#</th><th class="px-2 py-1 text-left text-neutral-content">Name</th><th class="px-2 py-1 text-left text-neutral-content">Category</th><th class="px-2 py-1 text-left text-neutral-content">Location</th><th class="px-2 py-1 text-left text-neutral-content">IMEI</th><th class="px-2 py-1 text-left text-neutral-content">Notes</th><th class="px-2 py-1 text-left text-neutral-content">Status</th><th class="px-2 py-1 text-left text-neutral-content">Actions</th>
            </tr>`;
            table.appendChild(thead);
            let tbody = document.createElement('tbody');
            devicesToRender.forEach(device => {
                let status = device.reservedByName ? `<span class="text-red-500 font-semibold">Reserved: ${device.reservedByName}</span>` : `<span class="text-green-500 font-semibold">Available</span>`;
                let actionsHtml = generateButtonHtml(device);
                if (currentUser.isLead) { 
                    actionsHtml += `<button data-device-id="${device.id}" class="edit-device-btn-trigger bg-neutral-500 hover:bg-neutral-600 text-white font-semibold px-2 py-1 rounded-lg text-xs ml-1">Edit</button>`;
                }
                let tr = document.createElement('tr');
                tr.className = "hover:bg-neutral-50 dark:hover:bg-neutral-700";
                tr.dataset.deviceId = device.id;
                tr.innerHTML = `
                    <td class="px-2 py-1 text-neutral-content">${device.index !== undefined ? device.index : ''}</td><td class="px-2 py-1 text-neutral-content">${device.name || ''}</td><td class="px-2 py-1 text-neutral-content">${device.category || ''}</td><td class="px-2 py-1 text-neutral-content">${device.location || ''}</td><td class="px-2 py-1 text-neutral-content">${device.imei || ''}</td><td class="px-2 py-1 text-neutral-content table-cell-truncate" title="${device.notes || ''}">${device.notes || ''}</td><td class="px-2 py-1">${status}</td><td class="px-2 py-1 flex gap-1">${actionsHtml}</td>
                `;
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            allDevicesSection.appendChild(table);
        } else {
            const otherDevicesGrid = document.createElement('div');
            otherDevicesGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6';
            devicesToRender.forEach(device => renderSingleDeviceCard(device, otherDevicesGrid, false));
            allDevicesSection.appendChild(otherDevicesGrid);
        }
        deviceContainer.appendChild(allDevicesSection);
    }
    
    if (devicesToRender.length === 0 && reservedByCurrentUser.length === 0) {
        const searchTerm = searchInput ? searchInput.value : '';
        let message = "No devices found.";
        if (searchTerm) message = `No devices match your search for "${searchTerm}".`;
        else if (currentCategoryFilter) message = `No devices found in the "${currentCategoryFilter}" category.`;
        deviceContainer.innerHTML = `<p class="text-neutral-muted col-span-full text-center py-8">${message}</p>`;
    }

    // Attach event listeners
    attachCardButtonListeners();
}

/**
 * Attaches event listeners to all action buttons on the device cards.
 * This is called after rendering to ensure new elements are interactive.
 */
function attachCardButtonListeners() {
    document.querySelectorAll('.reserve-btn').forEach(button => {
        button.onclick = (e) => { e.stopPropagation(); openReservationModal(button.dataset.deviceId); };
    });
    document.querySelectorAll('.release-btn').forEach(button => {
        button.onclick = (e) => { e.stopPropagation(); releaseDevice(button.dataset.deviceId); };
    });
    if (currentUser.isLead) {
        document.querySelectorAll('.edit-device-btn-trigger').forEach(button => {
            button.onclick = (e) => { 
                e.stopPropagation(); 
                openDeviceManagementModal('edit', button.dataset.deviceId); 
            };
        });
    }
}

/**
 * Generates the appropriate action button HTML ('Reserve' or 'Release') for a device.
 * @param {object} device The device data object.
 * @returns {string} The HTML string for the button.
 */
function generateButtonHtml(device) {
    if (!currentUser.isTeamMember) { 
         if (!currentUser.uid) { 
            return `<button class="w-full bg-neutral-300 dark:bg-neutral-600 text-neutral-500 dark:text-neutral-400 font-semibold py-2 px-4 rounded-lg cursor-not-allowed" disabled>Sign in to Reserve</button>`;
        } else { 
             return `<button class="w-full bg-neutral-300 dark:bg-neutral-600 text-neutral-500 dark:text-neutral-400 font-semibold py-2 px-4 rounded-lg cursor-not-allowed" disabled>Team Only to Reserve</button>`;
        }
    }

    if (device.reservedByName) { 
        return `<button data-device-id="${device.id}" class="release-btn w-full bg-accent hover:bg-yellow-600 dark:bg-accent-dark dark:hover:bg-yellow-500 text-white font-semibold py-2 px-4 rounded-lg transition duration-150 ease-in-out">Release</button>`;
    } else { 
        return `<button data-device-id="${device.id}" class="reserve-btn w-full bg-primary hover:bg-blue-700 dark:bg-primary-dark dark:hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-150 ease-in-out">Reserve</button>`;
    }
}

/**
 * Gets a sorted list of unique categories from all devices.
 * @returns {Array<string>} A sorted array of unique category names.
 */
function getUniqueCategories() { 
    return [...new Set(allDevices.map(d => d.category || 'Uncategorized'))].sort();
}

/**
 * Populates the category filter dropdown with unique categories.
 */
function populateCategoryDropdown() {
    if (!sortCategorySelect) return;
    const categories = getUniqueCategories();
    const currentVal = sortCategorySelect.value;
    sortCategorySelect.innerHTML = `<option value="">All Categories</option>${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}`;
    sortCategorySelect.value = currentVal;
}

/**
 * Filters the `allDevices` array based on search and category filters, then calls `renderDevices`.
 */
function filterAndRenderDevices() {
    if (!deviceContainer) return;
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
    
    let devicesForCurrentUser = [];
    let otherFilteredDevices = [];

    allDevices.forEach(device => {
        const searchCorpus = [device.name, device.category, device.imei, device.location, device.notes].join(' ').toLowerCase();
        const matchesSearch = searchTerm.startsWith('#')
            ? (device.index !== undefined && String(device.index).includes(searchTerm.slice(1).trim()))
            : searchCorpus.includes(searchTerm);
        
        const matchesCategory = currentCategoryFilter ? (device.category || 'Uncategorized') === currentCategoryFilter : true;

        if (matchesSearch && matchesCategory) {
            if (device.reservedByUserId === currentUser.uid) {
                devicesForCurrentUser.push(device);
            } else {
                 otherFilteredDevices.push(device);
            }
        }
    });
    
    renderDevices(otherFilteredDevices, devicesForCurrentUser);
}

/** Toggles compact view mode. */
function toggleCompactMode() { 
    if(veryCompactMode) return; 
    compactMode = !compactMode;
    if (compactToggleButton) compactToggleButton.textContent = compactMode ? "Expand Actions" : "Compact View";
    filterAndRenderDevices();
}

/** Toggles very compact (list) view mode. */
function toggleVeryCompactMode() {
    veryCompactMode = !veryCompactMode;
    if (veryCompactToggleButton) veryCompactToggleButton.textContent = veryCompactMode ? "Card View" : "List View";
    if (veryCompactMode) { 
        compactMode = true; 
        if (compactToggleButton) compactToggleButton.textContent = "Expand Actions";
    }
    updateUIAccess(); 
}

/**
 * Removes a device from the database.
 * @param {string} deviceId The ID of the device to remove.
 * @returns {Promise<boolean>} True if successful.
 */
async function removeDevice(deviceId) {
    if (!currentUser.isLead) { showMessage("Permission denied. Only Team Leads can remove devices.", true); return false; }
    if (!deviceId || !currentUser.uid) { showMessage("Error: Missing device ID or user information.", true); return false; }

    const confirmed = await showConfirmationModal("Are you sure you want to remove this device? This action cannot be undone.");
    if (!confirmed) return false;

    try {
        await deleteDoc(doc(db, devicesCollectionPath, deviceId));
        showMessage("Device removed successfully!");
        return true; 
    } catch (error) {
        console.error("Error removing device: ", error);
        showMessage(`Error removing device: ${error.message}`, true);
        return false; 
    }
}

/**
 * Processes the reservation of a device.
 * @param {string} deviceId The ID of the device to reserve.
 * @param {string} userNameToReserveWith The name of the user reserving the device.
 * @returns {Promise<boolean>} True if successful.
 */
async function processDeviceReservation(deviceId, userNameToReserveWith) {
     if (!currentUser.isTeamMember || !currentUser.uid || !userNameToReserveWith || !deviceId) {
        showMessage("Error: Missing information for reservation.", true);
        return false;
    }

    const reserveButtonInCard = document.querySelector(`.reserve-btn[data-device-id="${deviceId}"]`);
    if (reserveButtonInCard) { reserveButtonInCard.disabled = true; reserveButtonInCard.textContent = 'Reserving...'; }

    try {
        await updateDoc(doc(db, devicesCollectionPath, deviceId), {
            reservedByName: userNameToReserveWith, 
            reservedByUserId: currentUser.uid,
            reservationDate: Timestamp.now()
        });
        showMessage(`Device reserved successfully by ${userNameToReserveWith}!`);
        return true;
    } catch (error) {
        console.error("Error during reservation: ", error);
        showMessage(`Error reserving device: ${error.message}`, true);
        if (reserveButtonInCard) { reserveButtonInCard.disabled = false; reserveButtonInCard.textContent = 'Reserve';}
        return false;
    }
}

/** Opens the reservation modal or processes the reservation directly if the user's name is known. */
function openReservationModal(deviceId) {
    if (!currentUser.isTeamMember) { showMessage("Only team members can reserve devices.", true); return; }
    if (!currentUser.uid) { showMessage("You must be signed in to reserve a device.", true); return; }

    if (currentUser.name && currentUser.name !== 'N/A' && currentUser.name !== 'Guest') { 
        processDeviceReservation(deviceId, currentUser.name);
    } else { 
        if (deviceIdToReserveInput) deviceIdToReserveInput.value = deviceId;
        if (nameInputForReservation) nameInputForReservation.value = ''; 
        if (reservationModal) reservationModal.classList.add('active');
        if (nameInputForReservation) nameInputForReservation.focus();
    }
}

/** Closes the reservation modal. */
function closeReservationModal() {
    if (reservationModal) reservationModal.classList.remove('active');
}

/** Confirms and processes a device reservation from the modal. */
async function confirmReservation() { 
    if (!currentUser.isTeamMember) { showMessage("Only team members can reserve devices.", true, true); closeReservationModal(); return; }

    const deviceId = deviceIdToReserveInput.value;
    const nameToReserve = nameInputForReservation.value.trim();

    if (!nameToReserve) { showMessage("Please enter your name.", true, true); return; }

    confirmReservationButton.disabled = true; confirmReservationButton.textContent = 'Reserving...';
    
    const reservationSuccess = await processDeviceReservation(deviceId, nameToReserve);

    if (reservationSuccess && (!currentUser.name || currentUser.name === 'N/A' || currentUser.name === 'Guest')) {
        try {
            await setDoc(doc(db, teamMembersCollectionPath, currentUser.uid), { name: nameToReserve }, { merge: true });
            currentUser.name = nameToReserve; 
            if (userIdDisplay) userIdDisplay.textContent = `User ID: ${currentUser.uid} (${currentUser.name} - ${currentUser.role || 'No Role'})`;
        } catch (nameError) {
            console.error("Error saving user name:", nameError);
            showMessage("Device reserved, but failed to save your name. You can set it via User Settings.", true, true);
        }
    }
    
    if(reservationSuccess) closeReservationModal();
    confirmReservationButton.disabled = false; confirmReservationButton.textContent = 'Confirm Reservation';
}

/**
 * Releases a reserved device.
 * @param {string} deviceId The ID of the device to release.
 * @param {boolean} isDirectAction True if the action originated from a direct URL link.
 */
async function releaseDevice(deviceId, isDirectAction = false) { 
    if (!currentUser.isTeamMember) { showMessage("Only team members can release devices.", true, isDirectAction); return; }
    if (!deviceId) { showMessage("Error: Missing ID for release.", true, isDirectAction); return; }
    
    try {
        const deviceRef = doc(db, devicesCollectionPath, deviceId);
        await updateDoc(deviceRef, { reservedByName: null, reservedByUserId: null, reservationDate: null });
        showMessage("Device released successfully!", false, isDirectAction);
    } catch (error) {
        console.error("Error releasing device: ", error);
        showMessage(`Error releasing device: ${error.message}`, true, isDirectAction);
    }
}

// --- QR Code Scanner Logic ---
/** Starts the QR code scanner. */
function startScanner() {
    if (!scanModal) return;
    
    // Reset modal state
    scannedDeviceContainer.innerHTML = '';
    scannedDeviceContainer.classList.add('hidden');
    scannerContainer.classList.remove('hidden');
    qrReaderResults.innerHTML = '<p class="text-neutral-muted">Point your camera at a QR code.</p>';
    
    scanModal.classList.add('active');

    // Initialize scanner if it's not already
    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }

    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        console.log(`Scan successful, result: ${decodedText}`);
        qrReaderResults.innerHTML = `<p class="text-green-500 font-bold">Code found! Looking for device...</p>`;
        stopScanner(false); // Stop scanning but keep modal open

        const device = allDevices.find(d => d.id === decodedText);

        if (device) {
            scannerContainer.classList.add('hidden');
            scannedDeviceContainer.innerHTML = ''; // Clear previous
            renderSingleDeviceCard(device, scannedDeviceContainer, true);
            attachCardButtonListeners(); // Re-attach listeners for the new card
            scannedDeviceContainer.classList.remove('hidden');
        } else {
            qrReaderResults.innerHTML = `<p class="text-danger font-bold">Device with ID ${decodedText} not found in the inventory.</p>`;
        }
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
        .catch(err => {
            console.error("QR Scanner Error:", err);
            qrReaderResults.innerHTML = `<p class="text-danger">Error starting camera: ${err}</p>`;
        });
}

/**
 * Stops the QR code scanner and optionally closes the modal.
 * @param {boolean} shouldCloseModal - Whether to close the modal after stopping.
 */
function stopScanner(shouldCloseModal = true) {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            console.log("QR Code scanning stopped.");
            if (shouldCloseModal && scanModal) {
                scanModal.classList.remove('active');
            }
        }).catch(err => {
            console.error("Error stopping QR scanner:", err);
            // Even if stopping fails, still close the modal if requested
            if (shouldCloseModal && scanModal) {
                scanModal.classList.remove('active');
            }
        });
    } else {
        if (shouldCloseModal && scanModal) {
            scanModal.classList.remove('active');
        }
    }
}


// --- Device Management Logic (Add, Edit, Bulk Add) ---
/** Opens the device management modal to a specific view. */
function openDeviceManagementModal(view = 'add', deviceId = null) {
    if (!currentUser.isLead) { showMessage("Permission denied.", true); return; }
    resetDeviceManagementForms();
    if (view === 'edit' && deviceId) {
        const device = allDevices.find(d => d.id === deviceId);
        if (!device) { showMessage("Device not found for editing.", true); return; }
        populateEditDeviceForm(device);
    }
    showDeviceManagementView(view);
    if (deviceManagementModal) deviceManagementModal.classList.add('active');
}

/** Closes the device management modal. */
function closeDeviceManagementModal() { if (deviceManagementModal) deviceManagementModal.classList.remove('active'); }

/** Shows a specific view within the device management modal. */
function showDeviceManagementView(viewToShow) {
    addDeviceView.style.display = 'none';
    editDeviceView.style.display = 'none';
    bulkAddDevicesView.style.display = 'none';

    if (viewToShow === 'add') {
        deviceManagementTitle.textContent = 'Add New Device';
        addDeviceView.style.display = 'block';
        if (newDeviceNameInput) newDeviceNameInput.focus();
    } else if (viewToShow === 'edit') {
        deviceManagementTitle.textContent = 'Edit Device';
        editDeviceView.style.display = 'block';
        if (editDeviceNameInput) editDeviceNameInput.focus();
    } else if (viewToShow === 'bulk') {
        deviceManagementTitle.textContent = 'Bulk Add Devices';
        bulkAddDevicesView.style.display = 'block';
        if (bulkDevicesTextarea) bulkDevicesTextarea.focus();
    }
}

/** Resets all forms within the device management modal. */
function resetDeviceManagementForms() {
    [newDeviceNameInput, newDeviceCategoryInput, newDeviceIMEIInput, newDeviceIndexInput, newDeviceLocationInput, newDeviceNotesInput,
     editDeviceNameInput, editDeviceCategoryInput, editDeviceIMEIInput, editDeviceIndexInput, editDeviceLocationInput, editDeviceNotesInput,
     editDeviceIdInput, bulkDevicesTextarea].forEach(el => { if (el) el.value = ''; });
    deviceManagementModal.querySelectorAll('.modal-message-area').forEach(area => area.textContent = '');
}

/** Populates the edit device form with data. */
function populateEditDeviceForm(device) {
    if (editDeviceIdInput) editDeviceIdInput.value = device.id;
    if (editDeviceNameInput) editDeviceNameInput.value = device.name || '';
    if (editDeviceCategoryInput) editDeviceCategoryInput.value = device.category || '';
    if (editDeviceIMEIInput) editDeviceIMEIInput.value = device.imei || '';
    if (editDeviceIndexInput) editDeviceIndexInput.value = device.index !== undefined ? device.index.toString() : '';
    if (editDeviceLocationInput) editDeviceLocationInput.value = device.location || '';
    if (editDeviceNotesInput) editDeviceNotesInput.value = device.notes || '';
}

/** Handles the confirmation of adding a new device. */
async function confirmAddDevice() {
    if (!currentUser.isLead) { showMessage("Permission denied.", true, true); return; }
    const name = newDeviceNameInput.value.trim();
    const category = newDeviceCategoryInput.value.trim();
    const imei = newDeviceIMEIInput.value.trim();
    const index = newDeviceIndexInput.value.trim();
    const location = newDeviceLocationInput.value.trim();
    const notes = newDeviceNotesInput.value.trim();

    if (!name || !category || !index || !location) { 
        showMessage("Name, category, index, and location are required.", true, true); 
        return; 
    }
    if (isNaN(Number(index))) { showMessage("Index must be a number.", true, true); return; }

    confirmAddDeviceButton.disabled = true; confirmAddDeviceButton.textContent = 'Adding...';
    try {
        await addDoc(devicesCol, {
            name, category, imei: imei || 'N/A', index: Number(index), location, notes: notes || '',
            reservedByName: null, reservedByUserId: null, reservationDate: null, 
            addedByUserId: currentUser.uid, addedDate: Timestamp.now()
        });
        showMessage("Device added successfully!"); 
        closeDeviceManagementModal();
    } catch (error) { 
        console.error("Error adding device: ", error); 
        showMessage(`Error adding device: ${error.message}`, true, true);
    } finally { 
        confirmAddDeviceButton.disabled = false; confirmAddDeviceButton.textContent = 'Add Device'; 
    }
}

/** Handles the confirmation of editing an existing device. */
async function confirmEditDevice() {
    if (!currentUser.isLead) { showMessage("Permission denied.", true, true); return; }
    const deviceId = editDeviceIdInput.value;
    const name = editDeviceNameInput.value.trim();
    const category = editDeviceCategoryInput.value.trim();
    const imei = editDeviceIMEIInput.value.trim();
    const index = editDeviceIndexInput.value.trim();
    const location = editDeviceLocationInput.value.trim();
    const notes = editDeviceNotesInput.value.trim();

    if (!name || !category || !index || !location) {
        showMessage("Name, category, index, and location are required.", true, true); 
        return; 
    }
    if (isNaN(Number(index))) { showMessage("Index must be a number.", true, true); return; }

    confirmEditDeviceButton.disabled = true; confirmEditDeviceButton.textContent = 'Saving...';
    try {
        await updateDoc(doc(db, devicesCollectionPath, deviceId), { 
            name, category, imei: imei || 'N/A', index: Number(index), location, notes: notes || '' 
        });
        showMessage("Device updated successfully!"); 
        closeDeviceManagementModal();
    } catch (error) { 
        console.error("Error updating device: ", error); 
        showMessage(`Error updating device: ${error.message}`, true, true);
    } finally { 
        confirmEditDeviceButton.disabled = false; confirmEditDeviceButton.textContent = 'Save Changes'; 
    }
}

/** Processes a block of text to add multiple devices at once. */
async function confirmBulkAddDevices() {
    if (!currentUser.isLead) { showMessage("Permission denied.", true, true); return; }
    const text = bulkDevicesTextarea.value.trim();
    if (!text) { showMessage("Paste device data first (CSV: name,category,imei,index,location,notes).", true, true); return; }
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    let added = 0, failed = 0;
    confirmBulkAddDevicesButton.disabled = true; confirmBulkAddDevicesButton.textContent = `Adding ${lines.length}...`;
    
    const batch = writeBatch(db);
    for (const line of lines) {
        let [name, category, imei, index, location, notes] = line.split(',').map(s => s.trim());
        if (!name || !category || !index || isNaN(Number(index)) || !location) {
            failed++; 
            console.warn("Skipping invalid line:", line); 
            continue; 
        }
        const newDeviceRef = doc(collection(db, devicesCollectionPath));
        batch.set(newDeviceRef, {
            name, category, imei: imei || 'N/A', index: Number(index), location, notes: notes || '',
            reservedByName: null, reservedByUserId: null, reservationDate: null, 
            addedByUserId: currentUser.uid, addedDate: Timestamp.now()
        });
        added++;
    }

    try {
        await batch.commit();
        showMessage(`Bulk add complete. Added: ${added}, Failed: ${failed}.`, failed > 0, true);
        if (added > 0) closeDeviceManagementModal();
    } catch(e) {
        showMessage(`Error committing bulk add: ${e.message}`, true, true);
    }

    confirmBulkAddDevicesButton.disabled = false; confirmBulkAddDevicesButton.textContent = 'Add Devices';
}


// --- User Settings & Management Logic ---
/** Opens the user management modal. */
function openUserManagementModal() {
    showUserManagementView('manage');
    fetchAllTeamMembers(); 
    if (userManagementModal) userManagementModal.classList.add('active');
}

/** Closes the user management modal. */
function closeUserManagementModal() { if (userManagementModal) userManagementModal.classList.remove('active'); }

/** Shows a specific view within the user management modal. */
function showUserManagementView(viewToShow, userToEdit = null) {
    manageUsersView.style.display = 'none';
    addUserView.style.display = 'none';
    editUserView.style.display = 'none';
    userManagementModal.querySelectorAll('.modal-message-area').forEach(area => area.textContent = '');

    if (viewToShow === 'manage') {
        manageUsersView.style.display = 'block';
        fetchAllTeamMembers();
    } else if (viewToShow === 'add') {
        if (!currentUser.isLead) { showMessage("Only Leads can add users.", true); showUserManagementView('manage'); return; }
        if (newMemberUidInput) newMemberUidInput.value = '';
        if (newMemberNameInput) newMemberNameInput.value = '';
        if (newMemberRoleSelect) newMemberRoleSelect.value = ROLES.ESD_MEMBER;
        addUserView.style.display = 'block';
    } else if (viewToShow === 'edit' && userToEdit) {
        const isSelfEdit = userToEdit.uid === currentUser.uid;
        if (!currentUser.isLead && !isSelfEdit) { showMessage("Permission denied.", true); return; }

        if (editUserIdInput) editUserIdInput.value = userToEdit.uid;
        if (editUserNameInput) editUserNameInput.value = userToEdit.name || '';
        if (editUserRoleSelect) {
            editUserRoleSelect.value = userToEdit.role || ROLES.ESD_MEMBER;
            editUserRoleSelect.disabled = !currentUser.isLead; 
        }
        if (removeUserButtonInEditModal) {
            removeUserButtonInEditModal.style.display = (currentUser.isLead && !isSelfEdit) ? 'inline-block' : 'none';
            removeUserButtonInEditModal.dataset.uidToRemove = userToEdit.uid;
        }
        if (editUserTitle) editUserTitle.textContent = isSelfEdit ? "Edit Your Profile" : "Edit Team Member";
        editUserView.style.display = 'block';
    }
}

/** Handles the confirmation of adding a new user. */
async function confirmAddUser() { /* ... unchanged ... */ }
/** Handles the confirmation of editing a user. */
async function confirmEditUser() { /* ... unchanged ... */ }
/** Removes a user from the team. */
async function removeUserFromTeam(userIdToRemove) { /* ... unchanged ... */ }
/** Fetches all team members from Firestore. */
async function fetchAllTeamMembers() { /* ... unchanged ... */ }
/** Renders the list of users in the management table. */
function renderUsersTable() { /* ... unchanged ... */ }


// --- Utility Functions (Messaging, Confirmation, Theme) ---
/** Displays a message to the user. */
function showMessage(message, isError = false, inModal = false) {
    const activeModal = document.querySelector('.modal.active:not(#messageModal):not(#confirmationModal)'); 
    const modalMessageArea = activeModal?.querySelector('.modal-message-area');

    if (inModal && modalMessageArea) {
        modalMessageArea.textContent = message;
        modalMessageArea.className = `modal-message-area text-sm mb-3 text-center ${isError ? 'text-danger' : 'text-green-500'}`;
        setTimeout(() => { if(modalMessageArea) modalMessageArea.textContent = ''; }, 4000);
    } else if (messageModal && messageText) {
        messageText.textContent = message;
        messageText.className = `text-lg mb-6 ${isError ? 'text-danger dark:text-red-400' : 'text-green-600 dark:text-green-400'}`;
        messageModal.classList.add('active');
    } else { console.log(`Message (isError: ${isError}): ${message}`); }
}

/** Closes the general message modal. */
function closeMessageModal() { if (messageModal) messageModal.classList.remove('active'); }

/** Shows a confirmation modal and returns a promise. */
let resolveConfirmation;
async function showConfirmationModal(message) {
    if (!confirmationModal) { console.warn("Confirmation modal not found."); return true; }
    confirmationMessageText.textContent = message;
    confirmationModal.classList.add('active');
    return new Promise((resolve) => { resolveConfirmation = resolve; });
}

/** Sets the color theme (dark/light). */
function setTheme(isDark) {
    const html = document.documentElement;
    if (isDark) html.classList.add('dark'); else html.classList.remove('dark');
    if (themeToggleEmoji) themeToggleEmoji.textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

/** Sets the initial theme. */
function updateThemeFromStorageOrSystem() {
    const stored = localStorage.getItem('theme');
    if (stored) setTheme(stored === 'dark');
    else setTheme(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/** Sets the splash screen background. */
function setSplashBg() {
    const splash = document.getElementById('splash-overlay');
    if (splash) splash.style.background = document.documentElement.classList.contains('dark') ? '#111827' : '#fff';
}

/** Fades out and removes the splash screen. */
function hideSplash() {
    const splash = document.getElementById('splash-overlay');
    if (splash) {
        splash.style.transition = 'opacity 0.25s';
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 250);
    }
}

// --- Event Listeners Setup ---
/** Handles keyboard shortcuts. */
function handleKeybindings(e) {
    // Ctrl+F to focus search
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        if (searchInput) searchInput.focus();
    }

    // Spacebar to confirm modals
    if (e.key === ' ' || e.key === 'Spacebar') {
        // Prevent space from scrolling page when modal is open
        if(messageModal.classList.contains('active') || confirmationModal.classList.contains('active')) {
            e.preventDefault();
        }

        if (messageModal.classList.contains('active')) {
            if(closeMessageButton) closeMessageButton.click();
        } else if (confirmationModal.classList.contains('active')) {
            if(confirmActionButton) confirmActionButton.click();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    updateThemeFromStorageOrSystem();
    setSplashBg(); 
    setTimeout(hideSplash, 750); 

    // Search and Filter
    if (searchInput) searchInput.addEventListener('input', filterAndRenderDevices);
    if (sortCategorySelect) sortCategorySelect.addEventListener('change', (e) => { currentCategoryFilter = e.target.value; filterAndRenderDevices(); });
    
    // View Toggles
    if (compactToggleButton) compactToggleButton.addEventListener('click', toggleCompactMode);
    if (veryCompactToggleButton) veryCompactToggleButton.addEventListener('click', toggleVeryCompactMode);
    if (themeToggleButton) themeToggleButton.addEventListener('click', () => {
        const isDark = !document.documentElement.classList.contains('dark');
        if (themeToggleEmoji) { themeToggleEmoji.classList.add('spin'); setTimeout(() => themeToggleEmoji.classList.remove('spin'), 350); }
        setTheme(isDark);
        setSplashBg(); 
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', handleKeybindings);

    // Modals
    if (scanQRCodeButton) scanQRCodeButton.addEventListener('click', startScanner);
    if (closeScanModalButton) closeScanModalButton.addEventListener('click', () => stopScanner(true));

    if (confirmReservationButton) confirmReservationButton.addEventListener('click', confirmReservation);
    if (cancelReservationButton) cancelReservationButton.addEventListener('click', closeReservationModal);
    
    if (openDeviceManagementButton) openDeviceManagementButton.addEventListener('click', () => openDeviceManagementModal('add'));
    const switchToAddDeviceBtn = document.getElementById('switchToAddDeviceBtn');
    const switchToBulkAddBtn = document.getElementById('switchToBulkAddBtn');
    if (switchToAddDeviceBtn) switchToAddDeviceBtn.addEventListener('click', () => showDeviceManagementView('add'));
    if (switchToBulkAddBtn) switchToBulkAddBtn.addEventListener('click', () => showDeviceManagementView('bulk'));
    if (confirmAddDeviceButton) confirmAddDeviceButton.addEventListener('click', confirmAddDevice);
    if (backToDeviceManageFromAddBtn) backToDeviceManageFromAddBtn.addEventListener('click', closeDeviceManagementModal);
    if (confirmEditDeviceButton) confirmEditDeviceButton.addEventListener('click', confirmEditDevice);
    if (backToDeviceManageFromEditBtn) backToDeviceManageFromEditBtn.addEventListener('click', closeDeviceManagementModal);
    if (removeDeviceFromEditModalButton) removeDeviceFromEditModalButton.addEventListener('click', async () => {
        const deviceId = editDeviceIdInput.value;
        if (deviceId && await removeDevice(deviceId)) closeDeviceManagementModal();
    });
    if (confirmBulkAddDevicesButton) confirmBulkAddDevicesButton.addEventListener('click', confirmBulkAddDevices);
    if (backToDeviceManageFromBulkBtn) backToDeviceManageFromBulkBtn.addEventListener('click', closeDeviceManagementModal);

    if (userSettingsButton) userSettingsButton.addEventListener('click', openUserManagementModal);
    if (closeManageUsersButton) closeManageUsersButton.addEventListener('click', closeUserManagementModal);
    if (showAddUserViewBtn) showAddUserViewBtn.addEventListener('click', () => showUserManagementView('add'));
    if (backToUserManageFromAddBtn) backToUserManageFromAddBtn.addEventListener('click', () => showUserManagementView('manage'));
    if (backToUserManageFromEditBtn) backToUserManageFromEditBtn.addEventListener('click', () => showUserManagementView('manage'));
    if (confirmAddUserButton) confirmAddUserButton.addEventListener('click', confirmAddUser);
    if (confirmEditUserButton) confirmEditUserButton.addEventListener('click', confirmEditUser);
    if (removeUserButtonInEditModal) removeUserButtonInEditModal.addEventListener('click', () => {
        const uidToRemove = removeUserButtonInEditModal.dataset.uidToRemove;
        if (uidToRemove) removeUserFromTeam(uidToRemove);
    });

    if (closeMessageButton) closeMessageButton.addEventListener('click', closeMessageModal);
    if (confirmActionButton) confirmActionButton.addEventListener('click', () => { if (confirmationModal) confirmationModal.classList.remove('active'); if (resolveConfirmation) resolveConfirmation(true); });
    if (cancelActionButton) cancelActionButton.addEventListener('click', () => { if (confirmationModal) confirmationModal.classList.remove('active'); if (resolveConfirmation) resolveConfirmation(false); });

    if (Object.keys(firebaseConfig).length > 0) {
        initializeAuth();
    } else {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
});
