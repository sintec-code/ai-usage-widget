pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.components as PlasmaComponents

// Main card of the popup: the selected account with large limits.
GlassPanel {
    id: card

    property var section

    objectName: "card-" + section.key
    implicitHeight: content.implicitHeight + Kirigami.Units.largeSpacing * 2

    Accessible.role: Accessible.Grouping
    Accessible.name: card.section.title + " " + card.section.account

    SeverityColors {
        id: severity
    }

    AccentColors {
        id: colors
        accentHex: card.section.accent
    }

    ColumnLayout {
        id: content

        anchors.fill: parent
        anchors.margins: Kirigami.Units.largeSpacing
        spacing: Kirigami.Units.largeSpacing

        RowLayout {
            Layout.fillWidth: true
            spacing: Kirigami.Units.largeSpacing

            Badge {
                letter: card.section.badge
                accent: colors.accent
            }

            ColumnLayout {
                spacing: 0
                Layout.fillWidth: true

                Kirigami.Heading {
                    objectName: "serviceName"
                    level: 3
                    text: card.section.title
                    textFormat: Text.PlainText
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }

                PlasmaComponents.Label {
                    objectName: "accountName"
                    text: card.section.account
                    textFormat: Text.PlainText
                    opacity: 0.7
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }

            PlasmaComponents.BusyIndicator {
                visible: card.section.isLoading
                running: visible
                implicitWidth: Kirigami.Units.iconSizes.small
                implicitHeight: Kirigami.Units.iconSizes.small
                Accessible.name: "Checking now"
            }
        }

        PlasmaComponents.Label {
            objectName: "errorText"
            visible: card.section.hasError
            text: card.section.errorText
            textFormat: Text.PlainText
            color: severity.text(card.section.errorSeverity)
            Layout.fillWidth: true
            wrapMode: Text.Wrap
        }

        Repeater {
            model: card.section.mainRows

            ValueRow {
                required property var modelData

                objectName: "mainRow"
                label: modelData.label
                value: modelData.valueText
                isProblem: modelData.isProblem === true
                Layout.fillWidth: true
            }
        }

        Repeater {
            model: card.section.windows

            HeroBar {
                required property var modelData

                item: modelData
                accentHex: card.section.accent
                Layout.fillWidth: true
            }
        }

        Kirigami.Separator {
            objectName: "rowsSeparator"
            visible: card.section.rows.length > 0
            opacity: 0.5
            Layout.fillWidth: true
        }

        Repeater {
            model: card.section.rows

            ValueRow {
                required property var modelData

                objectName: "extraRow"
                label: modelData.label
                value: modelData.valueText
                isProblem: modelData.isProblem === true
                opacity: 0.8
                Layout.fillWidth: true
            }
        }
    }
}
