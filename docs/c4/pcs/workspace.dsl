workspace {
    model {
        !include ../hmcts.mdsl

        citizen = person "Citizen" "A claimant or defendant in a possession claim"
        caseworker = person "Caseworker" "A case worker"

        caseworker -> xui_webapp "Uses"
        caseworker -> idam_web_public "Logs in with"

        citizen -> pcs_frontend "Uses"
        citizen -> idam_web_public "Logs in with"

        ccd_data_store_api -> pcs_api "Callbacks"
    }

    views {
        !include ../hmcts.vdsl

        systemContext pcs "pcs-context" {
            include *
            include caseworker
            include xui
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container pcs "pcs-overview" {
            include *
            include caseworker
            include xui
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container pcs "pcs-citizen" {
            include *
            exclude idam
            exclude rpe
            exclude bsp
            autoLayout
        }

        container pcs "pcs-caseworker" {
            include *
            include caseworker
            include xui
            exclude citizen
            exclude pcs_frontend
            exclude idam
            exclude rpe
            exclude relationship==bsp->*

            autoLayout
        }

    }

}
