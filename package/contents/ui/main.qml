pragma ComponentBehavior: Bound

import QtQuick
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid

PlasmoidItem {
    id: root

    readonly property bool onDesktop: Plasmoid.formFactor === PlasmaCore.Types.Planar || Plasmoid.formFactor === PlasmaCore.Types.MediaCenter

    toolTipMainText: "AI usage"
    toolTipSubText: usage.viewModel.sections.filter(section => section.windows.length > 0).map(section => section.title + " " + section.account + ": " + section.windows.map(item => item.shortLabel + " " + item.percentText).join(", ")).join("\n")
    toolTipTextFormat: Text.PlainText
    preferredRepresentation: onDesktop ? fullRepresentation : compactRepresentation
    Plasmoid.backgroundHints: PlasmaCore.Types.TranslucentBackground

    UsageController {
        id: usage
        legacyConfiguration: Plasmoid.configuration
    }

    compactRepresentation: CompactView {
        viewModel: usage.viewModel
        horizontal: Plasmoid.formFactor !== PlasmaCore.Types.Vertical
        onActivated: root.expanded = !root.expanded
    }

    fullRepresentation: FullView {
        controller: usage
        title: Plasmoid.title
        popupExpanded: root.expanded
    }
}
