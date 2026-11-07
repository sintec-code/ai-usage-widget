pragma ComponentBehavior: Bound

import QtQuick

import "../code/core/monitor.mjs" as Monitor
import "../code/core/formatter.mjs" as Formatter
import "../code/core/accounts.mjs" as Accounts
import "../code/core/accountActions.mjs" as AccountActions
import "../code/core/check.mjs" as Check
import "../code/core/curlCommand.mjs" as CurlCommand
import "../code/core/listSync.mjs" as ListSync
import "../code/core/settingsFile.mjs" as SettingsFile
import "../code/core/units.mjs" as Units
import "../code/providers/registry.mjs" as Registry

Item {
    id: controller

    property var legacyConfiguration: null
    property string settingsFileName: SettingsFile.SETTINGS_FILE
    property int reloadIntervalMs: 30000
    property var settingsValues: SettingsFile.EMPTY_VALUES
    property bool settingsLoaded: false
    property int tickIntervalMs: 5000
    property var clock: () => Date.now()
    property alias walletService: wallet.service
    property alias walletOpenWaitMs: wallet.openWaitMs
    readonly property bool walletWaiting: wallet.waitingCount > 0
    readonly property var providers: Registry.ALL_PROVIDERS
    readonly property int refreshSeconds: Accounts.refreshSeconds(settingsValues.refreshSeconds)
    property var accounts: []
    // Times of day follow the locale short format, for example "5:40 p.m." for es_MX.
    readonly property var viewOptions: ({ timeText: time => new Date(time).toLocaleTimeString(Qt.locale(), Locale.ShortFormat) })
    property var viewModel: Formatter.buildViewModel([], clock(), viewOptions)
    readonly property ListModel sectionModel: ListModel {}
    readonly property var tools: ({
        runCommand: (command, timeoutMs) => commandRunner.run(command, timeoutMs),
        clock: () => controller.clock(),
        newBoundary: () => CurlCommand.newBoundary()
    })

    property var monitor: null
    property var actions: null
    property var settingsStore: null

    function syncSections(keys) {
        const current = []
        for (let index = 0; index < sectionModel.count; index += 1) {
            current.push(sectionModel.get(index).key)
        }
        ListSync.planListSync(current, keys).forEach(step => {
            if (step.op === "remove") {
                sectionModel.remove(step.index, 1)
            } else if (step.op === "insert") {
                sectionModel.insert(step.index, { key: step.key })
            } else {
                sectionModel.move(step.from, step.to, 1)
            }
        })
    }

    function refreshView() {
        const next = Formatter.buildViewModel(monitor.snapshot(), clock(), viewOptions)
        viewModel = next
        syncSections(next.keys)
    }

    function parseAccountsText(text) {
        return Accounts.parseAccounts(text || "", Registry.findProvider)
    }

    function readAccounts() {
        return parseAccountsText(settingsValues.accounts)
    }

    function legacySettings() {
        return {
            accounts: parseAccountsText(legacyConfiguration ? legacyConfiguration.accounts : ""),
            refreshSeconds: Accounts.refreshSeconds(legacyConfiguration ? legacyConfiguration.refreshSeconds : undefined)
        }
    }

    function applySettings(values) {
        const changed = values.accounts !== settingsValues.accounts || values.refreshSeconds !== settingsValues.refreshSeconds
        settingsValues = values
        if (changed || !settingsLoaded) {
            settingsLoaded = true
            reconfigure()
        }
        return values
    }

    function reloadSettings() {
        return settingsStore.load().then(result => {
            applySettings(result.values)
            return result
        })
    }

    function updateSettings(change) {
        return settingsStore.update(change).then(values => applySettings(values), error => {
            accounts = readAccounts()
            throw error
        })
    }

    function updateAccounts(change) {
        return updateSettings(values => ({ accounts: Accounts.serializeAccounts(change(parseAccountsText(values.accounts))) }))
    }

    function reconfigure() {
        if (!monitor) {
            return
        }
        accounts = readAccounts()
        monitor.configure({ accounts: accounts, intervalMs: refreshSeconds * Units.SECOND_MS })
        monitor.tick()
    }

    function setAccountOrder(ids) {
        return updateAccounts(list => Accounts.withOrder(list, ids))
    }

    function moveAccount(id, step) {
        return updateAccounts(list => Accounts.withAccountMoved(list, id, step))
    }

    function setRefreshSeconds(seconds) {
        return updateSettings(() => ({ refreshSeconds: Accounts.refreshSeconds(seconds) }))
    }

    function refreshNow() {
        return monitor.refreshNow()
    }

    function addAccount(spec) {
        return actions.add(spec)
    }

    function addAccounts(service, items) {
        return actions.addMany(service, items)
    }

    function newDiscoveries(providerId, items) {
        return Accounts.newDiscoveries(items, accounts, providerId)
    }

    function editAccount(id, spec) {
        return actions.edit(id, spec)
    }

    function deleteAccount(id) {
        return actions.remove(id)
    }

    function unlockWallet() {
        return wallet.unlock().then(result => {
            if (result.ok) {
                monitor.refreshNow()
            }
            return result
        })
    }

    function cancelWalletWait() {
        wallet.cancelWaiting()
    }

    function discover(providerId) {
        return Check.discoverAccounts(Registry.findProvider(providerId), tools)
    }

    CommandRunner {
        id: commandRunner

        objectName: "commandRunner"
    }

    WalletClient {
        id: wallet
    }

    Timer {
        interval: controller.reloadIntervalMs
        repeat: true
        running: controller.settingsLoaded
        onTriggered: controller.reloadSettings()
    }

    Timer {
        interval: controller.tickIntervalMs
        repeat: true
        running: controller.monitor !== null
        onTriggered: {
            controller.monitor.tick()
            controller.refreshView()
        }
    }

    Component.onCompleted: {
        monitor = Monitor.createMonitor({
            findProvider: Registry.findProvider,
            checkAccount: (provider, account) => Check.checkAccount(provider, account, tools),
            now: () => controller.clock(),
            onChange: refreshView
        })
        actions = AccountActions.createAccountActions({
            wallet: wallet,
            getAccounts: () => controller.readAccounts(),
            updateAccounts: change => controller.updateAccounts(change),
            findProvider: Registry.findProvider,
            newId: existing => Accounts.newAccountId(existing),
            recheck: id => controller.monitor.recheck(id)
        })
        settingsStore = SettingsFile.createSettingsStore({
            fileName: settingsFileName,
            runCommand: (command, timeoutMs) => commandRunner.run(command, timeoutMs),
            legacy: () => controller.legacySettings()
        })
        reconfigure()
        reloadSettings()
    }
}
