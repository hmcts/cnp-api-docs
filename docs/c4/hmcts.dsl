workspace {
    model {
        !include hmcts.mdsl
    }

    views {
        !include hmcts.vdsl

        systemLandscape landscape "nfdiv-landscape" {
            include *
            exclude idam
            exclude rpe

            autoLayout
        }

}
