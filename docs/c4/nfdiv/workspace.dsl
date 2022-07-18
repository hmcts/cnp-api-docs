workspace {
    model {
        !include ../hmcts.mdsl

        citizen = person "Citizen" "A citizen user."
        caseworker = person "Caseworker" "A case worker."

        caseworker -> xui_webapp "Uses"
        caseworker -> idam_web_public "Logs in with"

        citizen -> nfdiv_frontend "Uses"
        citizen -> idam_web_public "Logs in with"

        ccd_data_store_api -> nfdiv_case_api "Callbacks"
    }

    views {
        !include ../hmcts.vdsl

        systemContext nfdiv "nfdiv-context" {
            include *
            include caseworker
            include xui
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container nfdiv "nfdiv-overview" {
            include *
            include caseworker
            include xui
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container nfdiv "nfdiv-citizen" {
            include *
            exclude idam
            exclude rpe
            exclude bsp
            autoLayout
        }

        container nfdiv "nfdiv-caseworker" {
            include *
            include caseworker
            include xui
            exclude citizen
            exclude nfdiv_frontend
            exclude idam
            exclude rpe
            exclude relationship==bsp->*

            autoLayout
        }

    }

}
