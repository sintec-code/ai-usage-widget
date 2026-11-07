pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents
import org.kde.plasma.extras as PlasmaExtras

import "../code/core/formatter.mjs" as Formatter

PlasmaExtras.Representation {
    id: full

    property var controller
    readonly property var viewModel: controller ? controller.viewModel : Formatter.buildViewModel([], 0)
    property bool settingsOpen: false
    property bool popupExpanded: true
    // Account shown as the main card; kept in memory only.
    property string selectedKey: ""
    // The selected account when it has limits to show, else the first that has some.
    readonly property string heroKey: {
        const usable = full.viewModel.sections.filter(section => section.windows.length > 0)
        if (usable.some(section => section.key === full.selectedKey)) {
            return full.selectedKey
        }
        return usable.length > 0 ? usable[0].key : ""
    }

    onPopupExpandedChanged: {
        if (!popupExpanded) {
            clearSettingsStatus()
        }
    }

    function clearSettingsStatus() {
        settings.close()
    }

    function closeSettings() {
        settingsOpen = false
        settings.close()
    }

    function openSettings(startAdding) {
        settingsOpen = true
        if (startAdding) {
            settings.startAdd()
        }
    }

    Layout.minimumWidth: Kirigami.Units.gridUnit * 18
    Layout.preferredWidth: Kirigami.Units.gridUnit * 22
    Layout.preferredHeight: Kirigami.Units.gridUnit * 28
    collapseMarginsHint: true

    header: PlasmaExtras.PlasmoidHeading {
        objectName: "topBar"
        visible: full.viewModel.hasAccounts || full.settingsOpen

        RowLayout {
            anchors.fill: parent
            spacing: Kirigami.Units.smallSpacing

            Kirigami.Heading {
                objectName: "topBarTitle"
                level: 3
                text: full.title
                textFormat: Text.PlainText
                elide: Text.ElideRight
                Layout.fillWidth: true
            }

            PlasmaComponents.ToolButton {
                objectName: "refreshButton"
                icon.name: "view-refresh"
                text: "Refresh"
                display: PlasmaComponents.AbstractButton.IconOnly
                onClicked: full.controller.refreshNow()
                Accessible.name: "Refresh every account now"

                QQC2.ToolTip.text: "Refresh"
                QQC2.ToolTip.visible: hovered
            }

            PlasmaComponents.ToolButton {
                objectName: "settingsButton"
                icon.name: "configure"
                text: "Settings"
                display: PlasmaComponents.AbstractButton.IconOnly
                checked: full.settingsOpen
                onClicked: full.settingsOpen ? full.closeSettings() : full.openSettings(false)
                Accessible.name: full.settingsOpen ? "Close the settings" : "Open the settings"

                QQC2.ToolTip.text: "Settings"
                QQC2.ToolTip.visible: hovered
            }
        }
    }

    PlasmaComponents.Button {
        objectName: "emptyAddButton"
        anchors.centerIn: parent
        visible: !full.viewModel.hasAccounts && !full.settingsOpen && (full.controller ? full.controller.settingsLoaded : false)
        text: "Add account"
        icon.name: "list-add"
        onClicked: full.openSettings(true)
    }

    PlasmaComponents.ScrollView {
        id: scroll

        anchors.fill: parent
        visible: full.viewModel.hasAccounts && !full.settingsOpen
        contentWidth: availableWidth
        PlasmaComponents.ScrollBar.horizontal.policy: PlasmaComponents.ScrollBar.AlwaysOff

        ColumnLayout {
            width: scroll.availableWidth
            spacing: Kirigami.Units.largeSpacing

            Item {
                implicitHeight: 0
            }

            WalletWaitingText {
                objectName: "cardsWalletWaiting"
                controller: full.controller
                visible: full.controller ? full.controller.walletWaiting : false
                Layout.leftMargin: Kirigami.Units.largeSpacing
                Layout.rightMargin: Kirigami.Units.largeSpacing
            }

            UnlockButton {
                objectName: "cardsUnlock"
                visible: full.viewModel.walletLocked
                controller: full.controller
                Layout.leftMargin: Kirigami.Units.largeSpacing
                Layout.rightMargin: Kirigami.Units.largeSpacing
                Layout.fillWidth: true
            }

            HeroCard {
                visible: full.heroKey !== ""
                section: full.viewModel.sectionsByKey[full.heroKey] || Formatter.EMPTY_SECTION
                Layout.fillWidth: true
                Layout.leftMargin: Kirigami.Units.largeSpacing
                Layout.rightMargin: Kirigami.Units.largeSpacing
            }

            Repeater {
                model: full.controller ? full.controller.sectionModel : null

                Loader {
                    id: slot

                    required property string key
                    readonly property var section: full.viewModel.sectionsByKey[key] || Formatter.EMPTY_SECTION

                    active: key !== full.heroKey
                    visible: active
                    sourceComponent: section.windows.length > 0 ? compactRow : fullCard
                    Layout.fillWidth: true
                    Layout.leftMargin: Kirigami.Units.largeSpacing
                    Layout.rightMargin: Kirigami.Units.largeSpacing

                    Component {
                        id: compactRow

                        AccountRow {
                            section: slot.section
                            onSelected: full.selectedKey = slot.key
                        }
                    }

                    Component {
                        id: fullCard

                        AccountCard {
                            section: slot.section
                        }
                    }
                }
            }

            Item {
                implicitHeight: 0
            }
        }
    }

    SettingsView {
        id: settings

        objectName: "settingsView"
        anchors.fill: parent
        visible: full.settingsOpen
        controller: full.controller
        onBackRequested: full.closeSettings()
    }
}
