
workspace {
    model {
        !include ../hmcts.mdsl

        # citizen = person "Citizen" "A citizen user"
        # caseworker = person "Caseworker" "A case worker"

        # caseworker -> xui_webapp "Uses"
        # caseworker -> idam_web_public "Logs in with"

        # citizen -> probate_frontend "Uses"
        # citizen -> idam_web_public "Logs in with"

        # ccd_data_store_api -> probate_back_office "Callbacks"
    }

    views {
        !include ../hmcts.vdsl

        systemContext cmc "cmc-context" {
            include *
            # exclude caseworker
            # exclude citizen
            # include xui
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container cmc "cmc-overview" {
            include *
            # exclude caseworker
            # exclude citizen
            # include xui
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        # container cmc "cmc-citizen" {
        #     include *
        #     exclude idam
        #     exclude rpe
        #     exclude bsp
        #     autoLayout
        # }

        # container cmc "cmc-caseworker" {
        #     include *
        #     include caseworker
        #     include xui
        #     exclude citizen
        #     exclude nfdiv_frontend
        #     exclude idam
        #     exclude rpe
        #     exclude relationship==bsp->*

        #     autoLayout
        # }
    }
}
