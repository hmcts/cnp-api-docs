workspace {
    model {
        !include hmcts.mdsl

        citizen = person "Citizen" "A citizen user."
        caseworker = person "Caseworker" "A case worker."

        caseworker -> jui_webapp "Uses"
        caseworker -> idam_web_public "Logs in with"

        citizen -> nfdiv_frontend "Uses"
        citizen -> idam_web_public "Logs in with"

        ccd_data_store_api -> nfdiv_case_api "Callbacks"
    }

    views {
        systemLandscape landscape "HMCTSLandscape" {
            include *
            exclude citizen
            exclude caseworker
            autoLayout
        }

        systemContext nfdiv "SystemContext" {
            include *
            include caseworker
            autoLayout
        }

        container nfdiv "DivorceContainer" {
            include *
            include caseworker
            autoLayout
        }

        container nfdiv "CitizenView" {
            include *
            autoLayout lr
        }

        container nfdiv "CaseworkerView" {
            include *
            include caseworker
            exclude citizen
            exclude nfdiv_frontend
            autoLayout
        }

        styles {
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "Person" {
                shape person
                background #08427b
                color #ffffff
            }
        }
    }

}
